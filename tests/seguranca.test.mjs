// Testes de segurança (RLS + Storage) do Jardim Vivo.
// Rodam contra um Supabase LOCAL (npx supabase start) — criam usuários de teste.
//   npm run test:seguranca
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function env() {
  const vars = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
      if (m && !vars[m[1]]) vars[m[1]] = m[2]
    }
  } catch { /* sem .env.local */ }
  return vars
}
const E = env()
const URL_ = E.VITE_SUPABASE_URL
const KEY = E.VITE_SUPABASE_ANON_KEY
if (!URL_ || !KEY) throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou .env.local)')
if (!/127\.0\.0\.1|localhost/.test(URL_) && E.ALLOW_REMOTE !== '1') {
  throw new Error('Estes testes criam usuários: rode só no Supabase local (ou ALLOW_REMOTE=1).')
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(URL_, KEY, opts)
const BUCKET = 'plant-photos'
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

async function newUser(tag) {
  const c = createClient(URL_, KEY, opts)
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@teste.local`
  const { data, error } = await c.auth.signUp({ email, password: 'senha-teste-123' })
  if (error) throw error
  assert.ok(data.session, 'signup sem sessão: desative a confirmação de e-mail no Supabase local')
  return { c, id: data.user.id }
}

const ok = (res, msg) => { assert.equal(res.error, null, `${msg}: ${res.error?.message}`); return res.data }
const denied = (res, msg) => assert.ok(res.error, `${msg}: deveria ter sido bloqueado`)

let A, B, plantA, containerA, trayA, cellA, photoPath, oldPhotoPath

before(async () => {
  A = await newUser('a')
  B = await newUser('b')
  containerA = ok(await A.c.from('containers').insert({ nome: 'Vaso A' }).select().single(), 'vaso A')
  plantA = ok(await A.c.from('plants').insert({ nome_comum: 'Planta A', container_id: containerA.id }).select().single(), 'planta A')
  trayA = ok(await A.c.from('seed_trays').insert({ nome: 'Bandeja A', linhas: 1, colunas: 2 }).select().single(), 'bandeja A')
  cellA = ok(await A.c.from('seed_cells').insert({ tray_id: trayA.id, linha: 0, coluna: 0, status: 'plantada' }).select().single(), 'célula A')
  ok(await A.c.from('care_events').insert({ plant_id: plantA.id, tipo: 'rega' }), 'rega A')
  ok(await A.c.from('observations').insert({ plant_id: plantA.id, texto: 'obs A' }), 'obs A')
  ok(await A.c.from('tasks').insert({ plant_id: plantA.id, titulo: 'tarefa A' }), 'tarefa A')
  ok(await A.c.from('plant_container_history').insert({ plant_id: plantA.id, to_container_id: containerA.id }), 'hist A')
  oldPhotoPath = `${A.id}/${plantA.id}/old.png`
  photoPath = `${A.id}/${plantA.id}/atual.png`
  for (const p of [oldPhotoPath, photoPath]) {
    ok(await A.c.storage.from(BUCKET).upload(p, PNG, { contentType: 'image/png' }), 'upload A')
    ok(await A.c.from('plant_photos').insert({ plant_id: plantA.id, storage_path: p }), 'foto A')
  }
  ok(await A.c.from('plants').update({ foto_path: photoPath }).eq('id', plantA.id), 'foto_path A')
})

const TABLES = ['plants', 'plant_photos', 'care_events', 'observations', 'tasks',
  'plant_container_history', 'containers', 'seed_trays', 'seed_cells']

test('B e anônimo não leem nenhum dado de A', async () => {
  assert.equal(ok(await A.c.from('seed_tray_stats').select('*'), 'A stats').length, 1)
  assert.equal(ok(await B.c.from('seed_tray_stats').select('*'), 'B stats').length, 0, 'B viu resumo de bandeja de A')
  const st = await anon.from('seed_tray_stats').select('*')
  assert.ok(st.error || st.data.length === 0, 'anônimo viu resumo de bandeja')
  for (const t of TABLES) {
    const own = ok(await A.c.from(t).select('id'), `A lê ${t}`)
    assert.ok(own.length > 0, `A deveria ver seus ${t}`)
    assert.equal(ok(await B.c.from(t).select('id'), `B ${t}`).length, 0, `B viu ${t} de A`)
    const r = await anon.from(t).select('id')
    assert.ok(r.error || r.data.length === 0, `anônimo viu ${t}`)
  }
})

test('B não altera nem exclui dados de A', async () => {
  for (const t of TABLES) {
    const upd = await B.c.from(t).update({ owner_id: B.id }).neq('id', '00000000-0000-0000-0000-000000000000').select('id')
    assert.ok(upd.error || upd.data.length === 0, `B alterou ${t}`)
    const del = await B.c.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id')
    assert.ok(del.error || del.data.length === 0, `B excluiu ${t}`)
  }
  assert.equal(ok(await A.c.from('plants').select('id'), 'A').length, 1, 'planta de A sumiu')
})

test('B não cria registros ligados à planta/vaso/bandeja de A (plant_id forjado)', async () => {
  denied(await B.c.from('care_events').insert({ plant_id: plantA.id, tipo: 'rega' }), 'care_event')
  denied(await B.c.from('observations').insert({ plant_id: plantA.id, texto: 'x' }), 'observation')
  denied(await B.c.from('tasks').insert({ plant_id: plantA.id, titulo: 'x' }), 'task')
  denied(await B.c.from('plant_photos').insert({ plant_id: plantA.id, storage_path: `${B.id}/x.png` }), 'plant_photo')
  denied(await B.c.from('plant_container_history').insert({ plant_id: plantA.id }), 'history')
  denied(await B.c.from('seed_cells').insert({ tray_id: trayA.id, linha: 0, coluna: 1 }), 'seed_cell em bandeja de A')
  denied(await B.c.from('plants').insert({ nome_comum: 'x', container_id: containerA.id }), 'planta em vaso de A')

  const plantB = ok(await B.c.from('plants').insert({ nome_comum: 'Planta B' }).select().single(), 'planta B')
  denied(await B.c.from('plant_container_history').insert({ plant_id: plantB.id, to_container_id: containerA.id }), 'history p/ vaso de A')
  const trayB = ok(await B.c.from('seed_trays').insert({ nome: 'Bandeja B', linhas: 1, colunas: 1 }).select().single(), 'bandeja B')
  denied(await B.c.from('seed_cells').insert({ tray_id: trayB.id, linha: 0, coluna: 0, plant_id: plantA.id }), 'célula apontando p/ planta de A')
  denied(await B.c.from('plant_photos').insert({ plant_id: plantB.id, storage_path: photoPath }), 'foto com caminho de A')
  denied(await B.c.from('plants').update({ foto_path: photoPath }).eq('id', plantB.id).select().single(), 'foto_path apontando p/ arquivo de A')
})

test('fotos são privadas: sem URL pública, sem acesso de B/anônimo', async () => {
  const pub = A.c.storage.from(BUCKET).getPublicUrl(photoPath).data.publicUrl
  assert.notEqual((await fetch(pub)).status, 200, 'foto acessível pela URL pública')
  denied(await anon.storage.from(BUCKET).createSignedUrl(photoPath, 60), 'anônimo assinou foto privada')
  denied(await B.c.storage.from(BUCKET).createSignedUrl(photoPath, 60), 'B assinou foto de A')
  denied(await B.c.storage.from(BUCKET).download(photoPath), 'B baixou foto de A')
  denied(await B.c.storage.from(BUCKET).upload(`${A.id}/${plantA.id}/intruso.png`, PNG, { contentType: 'image/png' }), 'B enviou na pasta de A')
  const rm = await B.c.storage.from(BUCKET).remove([photoPath])
  assert.ok(rm.error || rm.data.length === 0, 'B apagou foto de A')

  const signed = ok(await A.c.storage.from(BUCKET).createSignedUrl(photoPath, 60), 'A assina a própria foto')
  assert.equal((await fetch(signed.signedUrl)).status, 200, 'URL assinada do dono não abre')
})

test('página pública: só plantas marcadas, só a foto atual', async () => {
  assert.equal(ok(await anon.rpc('public_plant', { p_codigo: plantA.codigo_publico }), 'rpc'), null, 'planta privada exposta')
  ok(await A.c.from('plants').update({ publica: true }).eq('id', plantA.id), 'publicar')
  const pub = ok(await anon.rpc('public_plant', { p_codigo: plantA.codigo_publico }), 'rpc pública')
  assert.equal(pub.nome_comum, 'Planta A')
  assert.equal(pub.notas, undefined, 'notas não deveriam aparecer')
  const s = ok(await anon.storage.from(BUCKET).createSignedUrl(photoPath, 60), 'anônimo assina foto atual da planta pública')
  assert.equal((await fetch(s.signedUrl)).status, 200)
  denied(await anon.storage.from(BUCKET).createSignedUrl(oldPhotoPath, 60), 'anônimo assinou foto antiga (não pública)')
  ok(await A.c.from('plants').update({ publica: false }).eq('id', plantA.id), 'despublicar')
  denied(await anon.storage.from(BUCKET).createSignedUrl(photoPath, 60), 'foto continuou acessível após despublicar')
})

test('código público é sempre gerado pelo sistema e não muda', async () => {
  const p = ok(await B.c.from('plants').insert({ nome_comum: 'forjada', codigo_publico: 'JV-999999' }).select().single(), 'insert')
  assert.notEqual(p.codigo_publico, 'JV-999999', 'cliente escolheu o código')
  assert.match(p.codigo_publico, /^JV-\d{6}$/)
  const u = await B.c.from('plants').update({ codigo_publico: 'JV-999998' }).eq('id', p.id).select().single()
  assert.ok(u.error || u.data.codigo_publico === p.codigo_publico, 'código foi alterado')
})

test('usuário não promove o próprio papel', async () => {
  await B.c.from('profiles').update({ papel: 'administrador' }).eq('id', B.id)
  const prof = ok(await B.c.from('profiles').select('papel').eq('id', B.id).single(), 'perfil')
  assert.equal(prof.papel, 'proprietario')
  ok(await B.c.from('profiles').update({ nome: 'Novo nome' }).eq('id', B.id), 'B altera o próprio nome')
})

test('dono continua conseguindo tudo no próprio jardim', async () => {
  ok(await A.c.from('care_events').insert({ plant_id: plantA.id, tipo: 'poda' }), 'cuidado')
  ok(await A.c.from('tasks').insert({ plant_id: plantA.id, titulo: 't' }), 'tarefa')
  ok(await A.c.from('tasks').insert({ titulo: 'tarefa geral' }), 'tarefa sem planta')
  ok(await A.c.from('seed_cells').insert({ tray_id: trayA.id, linha: 0, coluna: 1 }), 'célula')
  ok(await A.c.from('seed_cells').update({ status: 'transplantada', plant_id: plantA.id }).eq('id', cellA.id), 'transplante célula')
  const c2 = ok(await A.c.from('containers').insert({ nome: 'Vaso A2' }).select().single(), 'vaso 2')
  ok(await A.c.from('plant_container_history').insert({ plant_id: plantA.id, from_container_id: containerA.id, to_container_id: c2.id }), 'troca')
  ok(await A.c.from('plants').update({ container_id: c2.id }).eq('id', plantA.id), 'vaso novo')
})
