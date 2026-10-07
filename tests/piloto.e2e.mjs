// Teste ponta a ponta do fluxo do piloto (navegador + conferência no banco).
// Pré-requisitos: Supabase local (npx supabase start) e app rodando (npm run dev).
//   npm run test:e2e
// Variáveis: APP_URL (padrão http://localhost:5173), CHROMIUM_PATH (padrão /opt/pw-browsers/chromium)
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const APP = process.env.APP_URL ?? 'http://localhost:5173'
const OUT = process.env.E2E_OUT ?? 'test-results'
mkdirSync(OUT, { recursive: true })
if (!/127\.0\.0\.1|localhost/.test(env.VITE_SUPABASE_URL)) throw new Error('Rode só contra o Supabase local')

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' })
const errors = []
const steps = []
async function step(name, fn) {
  process.stdout.write(`▶ ${name} … `)
  try { await fn(); console.log('ok'); steps.push([name, 'ok']) } catch (e) { console.log('FALHOU'); steps.push([name, e.message]); throw e }
}
async function newPage(ctx, tag) {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag} console: ${m.text()}`) })
  return p
}
async function signup(page, email) {
  await page.goto(APP)
  await page.getByText('Criar conta').click()
  await page.fill('#nome', 'Piloto')
  await page.fill('#email', email)
  await page.fill('#senha', 'senha-piloto-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.locator('nav.nav').waitFor() // só existe dentro da área logada
}
const sheetClosed = (page) => page.locator('.sheet').waitFor({ state: 'detached' })

const emailA = `piloto-${Date.now()}@teste.local`
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await newPage(ctxA, 'A')
let trayId, plantId, codigo

try {
  await step('cadastro e login', async () => {
    await signup(page, emailA)
    await page.getByText('Registrar plantio em bandeja').waitFor()
    await db.auth.signInWithPassword({ email: emailA, password: 'senha-piloto-123' })
  })

  await step('vaso para o transplante', async () => {
    await page.goto(APP + '/vasos')
    await page.getByRole('button', { name: '+ Vaso' }).click()
    await page.getByPlaceholder('Vaso-01, Jardineira da janela…').fill('Vaso-01')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.getByText('Vaso-01', { exact: true }).waitFor()
  })

  await step('bandeja de 200 células (10×20)', async () => {
    await page.goto(APP + '/')
    await page.getByText('Registrar plantio em bandeja').click()
    await page.getByRole('button', { name: '+ Sementeira' }).click()
    await page.getByPlaceholder('Bandeja 24 células — março').fill('Bandeja 200')
    await page.locator('.sheet input[type=number]').nth(0).fill('10')
    await page.locator('.sheet input[type=number]').nth(1).fill('20')
    await page.getByRole('button', { name: 'Criar com 200 células' }).click()
    await page.getByText('Bandeja 200').click()
    await page.waitForURL(/sementeiras\//)
    trayId = page.url().split('/').pop()
    const { count } = await db.from('seed_cells').select('*', { count: 'exact', head: true }).eq('tray_id', trayId)
    assert.equal(count, 200)
    const { count: plantas } = await db.from('plants').select('*', { count: 'exact', head: true })
    assert.equal(plantas, 0, 'sementes não podem virar plantas automaticamente')
  })

  async function bulk(selectFn, apply) {
    await page.getByRole('button', { name: /Selecionar várias/ }).click()
    await selectFn()
    await page.getByRole('button', { name: 'Editar selecionadas' }).click()
    await apply()
    await page.locator('.sheet').getByRole('button', { name: /^Salvar/ }).click()
    await sheetClosed(page)
  }

  await step('semeadura em lote por linha e "todas vazias"', async () => {
    await bulk(() => page.getByRole('button', { name: 'A', exact: true }).click(), async () => {
      await page.locator('.sheet select').nth(1).selectOption({ label: 'Tomate' })
    })
    await bulk(() => page.getByRole('button', { name: 'B', exact: true }).click(), async () => {
      await page.locator('.sheet select').nth(1).selectOption({ label: 'Manjericão' })
    })
    await bulk(() => page.getByRole('button', { name: 'Todas vazias' }).click(), async () => {
      await page.getByPlaceholder('Ex.: Tomate cereja — marca X').fill('Mix de pimentas')
    })
    const { data } = await db.from('seed_cells').select('linha, status, species_id, semente, data_plantio').eq('tray_id', trayId)
    assert.equal(data.filter((c) => c.status === 'plantada').length, 200)
    assert.ok(data.every((c) => c.data_plantio), 'toda célula semeada deve ter data de plantio')
    assert.equal(data.filter((c) => c.linha >= 2 && c.semente === 'Mix de pimentas').length, 160)
  })

  await step('germinação em lote NÃO apaga a espécie de cada célula', async () => {
    await bulk(async () => {
      await page.getByRole('button', { name: 'A', exact: true }).click()
      await page.getByRole('button', { name: 'B', exact: true }).click()
    }, async () => {
      await page.locator('.sheet select').first().selectOption('germinada')
    })
    const { data } = await db.from('seed_cells').select('linha, status, species_id, data_germinacao, plant_species(nome_comum)').eq('tray_id', trayId).lte('linha', 1)
    assert.equal(data.length, 40)
    assert.ok(data.every((c) => c.status === 'germinada' && c.data_germinacao))
    assert.ok(data.filter((c) => c.linha === 0).every((c) => c.plant_species?.nome_comum === 'Tomate'), 'linha A perdeu Tomate')
    assert.ok(data.filter((c) => c.linha === 1).every((c) => c.plant_species?.nome_comum === 'Manjericão'), 'linha B perdeu Manjericão')
  })

  await step('perda registrada e mantida', async () => {
    await page.locator('.cell', { hasText: /^C1$/ }).click()
    await page.locator('.sheet select').first().selectOption('perdida')
    await page.locator('.sheet').getByRole('button', { name: 'Salvar' }).click()
    await sheetClosed(page)
  })

  await step('A1: germinada → muda → transplante para vaso (individualização)', async () => {
    await page.locator('.cell', { hasText: /^A1$/ }).click()
    await page.locator('.sheet select').first().selectOption('muda')
    await page.locator('.sheet').getByRole('button', { name: 'Salvar' }).click()
    await sheetClosed(page)
    await page.locator('.cell', { hasText: /^A1$/ }).click()
    await page.getByRole('button', { name: /Transplantar/ }).click()
    await page.waitForURL(/plantas\/nova/)
    await page.waitForTimeout(500)
    assert.notEqual(await page.locator('select').first().inputValue(), '', 'espécie não veio da célula')
    await page.locator('input[type=file]').setInputFiles({ name: 'muda.png', mimeType: 'image/png', buffer: PNG })
    await page.locator('.field', { hasText: 'Vaso / recipiente' }).locator('select').selectOption({ label: 'Vaso-01' })
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForURL(/plantas\/[0-9a-f-]{36}$/)
    plantId = page.url().split('/').pop()
    const { data: p } = await db.from('plants').select('*').eq('id', plantId).single()
    codigo = p.codigo_publico
    assert.match(codigo, /^JV-\d{6}$/)
    assert.equal(p.nome_comum, 'Tomate')
    assert.match(p.origem, /Bandeja 200, célula A1/)
    const { data: cell } = await db.from('seed_cells').select('status, plant_id').eq('tray_id', trayId).eq('linha', 0).eq('coluna', 0).single()
    assert.deepEqual(cell, { status: 'transplantada', plant_id: plantId })
    const { count } = await db.from('plants').select('*', { count: 'exact', head: true })
    assert.equal(count, 1, 'só a muda transplantada vira planta individual')
    const { data: hist } = await db.from('plant_container_history').select('*').eq('plant_id', plantId)
    assert.equal(hist.length, 1)
  })

  await step('foto privada exibida ao dono por URL assinada', async () => {
    const src = await page.locator('img.hero').getAttribute('src')
    assert.match(src, /\/object\/sign\/plant-photos\//, 'foto não usa URL assinada')
    const { data: p } = await db.from('plants').select('foto_path').eq('id', plantId).single()
    const pub = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/plant-photos/${p.foto_path}`
    assert.notEqual((await fetch(pub)).status, 200, 'foto acessível pela URL pública')
  })

  await step('identificação e estágio', async () => {
    await page.getByRole('link', { name: 'Editar' }).click()
    await page.locator('.field', { hasText: 'Identificação' }).locator('select').selectOption('confirmado')
    await page.locator('.field', { hasText: 'Confiança' }).locator('input').fill('90')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForURL(/plantas\/[0-9a-f-]{36}$/)
    await page.locator('.field', { hasText: 'Atualizar estágio' }).locator('select').selectOption('crescimento')
    await page.getByText('Estágio alterado de muda para crescimento.').waitFor()
  })

  await step('cuidados: rega e observação crítica suspendem adubação', async () => {
    await page.getByRole('button', { name: /Reguei/ }).first().click()
    await page.getByRole('button', { name: 'Registrar' }).click()
    await sheetClosed(page)
    await page.getByRole('button', { name: /Observar/ }).click()
    await page.locator('.sheet').getByRole('button', { name: 'Folhas amarelas' }).click()
    await page.locator('.sheet select').selectOption('crítica')
    await page.locator('.sheet').getByRole('button', { name: 'Salvar' }).click()
    await sheetClosed(page)
    const { data: tasks } = await db.from('tasks').select('tipo, titulo').eq('plant_id', plantId).is('concluida_em', null)
    assert.ok(tasks.some((t) => t.titulo === 'Reavaliar planta debilitada'))
    assert.ok(!tasks.some((t) => t.tipo === 'adubação'), 'adubação aberta em planta crítica')
    await page.screenshot({ path: `${OUT}/planta.png`, fullPage: true })
  })

  await step('relatório A4: 2 páginas, foto assinada', async () => {
    await page.setViewportSize({ width: 900, height: 1200 })
    await page.goto(`${APP}/plantas/${plantId}/relatorio`)
    await page.getByText('O que fazer hoje — passo a passo').waitFor()
    assert.equal(await page.locator('.a4').count(), 2)
    await page.locator('img.rfoto').waitFor()
    assert.match(await page.locator('img.rfoto').getAttribute('src'), /\/object\/sign\//)
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: `${OUT}/relatorio.pdf`, format: 'A4', printBackground: true })
    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 390, height: 844 })
  })

  await step('QR: etiqueta e dono abrindo a própria etiqueta', async () => {
    await page.goto(`${APP}/plantas/${plantId}/etiqueta`)
    await page.locator('.label img').first().waitFor()
    await page.getByText(`/p/${codigo}`).waitFor()
    await page.goto(`${APP}/p/${codigo}`)
    await page.waitForURL(new RegExp(`/plantas/${plantId}$`))
  })

  await step('QR: anônimo não vê planta privada; vê só o público depois de ativado', async () => {
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const ap = await newPage(anon, 'anon')
    await ap.goto(`${APP}/p/${codigo}`)
    await ap.getByText('não está público').waitFor()
    await db.from('plants').update({ publica: true }).eq('id', plantId)
    await ap.reload()
    await ap.getByText('Cuidados essenciais').waitFor()
    await ap.locator('img.hero').waitFor()
    assert.match(await ap.locator('img.hero').getAttribute('src'), /\/object\/sign\//)
    assert.equal(await ap.getByText('Folhas amarelas').count(), 0, 'observação vazou na página pública')
    await db.from('plants').update({ publica: false }).eq('id', plantId)
    await anon.close()
  })

  await step('outro usuário não acessa o registro', async () => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pb = await newPage(ctxB, 'B')
    await signup(pb, `outro-${Date.now()}@teste.local`)
    try {
      await pb.goto(`${APP}/plantas/${plantId}`)
      await pb.locator('.error').waitFor({ timeout: 10000 })
    } catch (e) { await pb.screenshot({ path: `${OUT}/falha-b.png`, fullPage: true }); throw e }
    await pb.goto(`${APP}/p/${codigo}`)
    await pb.getByText('não está público').waitFor()
    await pb.goto(`${APP}/sementeiras/${trayId}`)
    await pb.locator('.error').waitFor()
    await ctxB.close()
  })

  await step('exclusão exige digitar o código (cancelar mantém a planta)', async () => {
    await page.goto(`${APP}/plantas/${plantId}`)
    page.once('dialog', (d) => d.dismiss())
    await page.getByRole('button', { name: /Excluir/ }).click()
    await page.waitForTimeout(300)
    const { count } = await db.from('plants').select('*', { count: 'exact', head: true }).eq('id', plantId)
    assert.equal(count, 1)
  })

  await step('planta morta: encerra sem apagar nada', async () => {
    const before = await Promise.all(['care_events', 'observations', 'plant_photos', 'plant_container_history']
      .map(async (t) => (await db.from(t).select('*', { count: 'exact', head: true }).eq('plant_id', plantId)).count))
    await page.getByRole('button', { name: /Encerrar ciclo/ }).click()
    await page.locator('.sheet select').selectOption('morta')
    await page.locator('.sheet input').first().fill('apodreceu a raiz')
    await page.locator('.sheet').getByRole('button', { name: 'Encerrar' }).click()
    await sheetClosed(page)
    await page.getByText('Ciclo encerrado: Planta morreu — apodreceu a raiz.').waitFor()
    const { data: p } = await db.from('plants').select('ativa, estado_final, saude').eq('id', plantId).single()
    assert.deepEqual(p, { ativa: false, estado_final: 'morta', saude: 'crítica' })
    const after = await Promise.all(['care_events', 'observations', 'plant_photos', 'plant_container_history']
      .map(async (t) => (await db.from(t).select('*', { count: 'exact', head: true }).eq('plant_id', plantId)).count))
    assert.deepEqual(after.map((n, i) => n >= before[i]), [true, true, true, true], 'histórico diminuiu')
    const { count: abertas } = await db.from('tasks').select('*', { count: 'exact', head: true }).eq('plant_id', plantId).is('concluida_em', null)
    assert.equal(abertas, 0)
    await page.goto(`${APP}/plantas?f=encerradas`)
    await page.getByText('encerrada: morta').waitFor()
  })

  await step('resumo da bandeja', async () => {
    await page.goto(`${APP}/sementeiras`)
    await page.getByText('1 transplantadas').waitFor()
    await page.getByText('1 perdidas').waitFor()
    await page.screenshot({ path: `${OUT}/sementeiras.png` })
    await page.goto(`${APP}/sementeiras/${trayId}`)
    await page.screenshot({ path: `${OUT}/bandeja.png`, fullPage: true })
  })

  assert.deepEqual(errors, [], 'erros no console')
  console.log(`\n✅ ${steps.length} etapas ok, sem erros no console`)
} catch (e) {
  await page.screenshot({ path: `${OUT}/falha.png`, fullPage: true }).catch(() => {})
  console.error('\n❌', e.message, errors.length ? `\nConsole: ${errors.join('\n')}` : '')
  process.exitCode = 1
} finally {
  await browser.close()
}
