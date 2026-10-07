import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { photoUrl, supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { fmtDate, todayISO } from '../lib/dates'
import { fetchSpecies, useLoad } from '../lib/hooks'
import { publicPlantUrl, qrDataUrl } from '../lib/qr'
import type { Observation, Plant, Species, Task } from '../lib/types'
import { ErrorBox } from '../components/ui'

/*
 * Relatório Jardim Vivo — padrão de 2 páginas A4.
 * Página 1: Ação. Página 2: Conhecimento.
 * Documento sobre a planta: não inclui nada interno do aplicativo.
 */

async function load(id: string) {
  const [plant, tasks, obs, species] = await Promise.all([
    supabase.from('plants').select('*').eq('id', id).single().then(must),
    supabase.from('tasks').select('*').eq('plant_id', id).is('concluida_em', null).order('vence_em').then(must),
    supabase.from('observations').select('*').eq('plant_id', id).order('data', { ascending: false }).limit(5).then(must),
    fetchSpecies(),
  ])
  const p = plant as Plant
  return {
    plant: p,
    tasks: tasks as Task[],
    obs: obs as Observation[],
    species: (species as Species[]).find((s) => s.id === p.species_id) ?? null,
  }
}

function passosHoje(plant: Plant, tasks: Task[], sp: Species | null): string[] {
  const hoje = todayISO()
  const passos: string[] = []
  if (plant.saude === 'crítica') {
    passos.push('Leve a planta para um local com luz adequada à espécie, sem sol forte repentino.')
    passos.push('Verifique o substrato: se estiver encharcado, não regue; se estiver seco, regue devagar até escorrer pelo furo.')
    passos.push('Retire folhas totalmente secas ou podres com tesoura limpa.')
  }
  for (const t of tasks.filter((t) => t.vence_em <= hoje)) {
    passos.push(t.notas ? `${t.titulo}: ${t.notas}` : `${t.titulo}.`)
  }
  if (!tasks.some((t) => t.tipo === 'rega' && t.vence_em <= hoje)) {
    passos.push('Toque o substrato com o dedo (2 cm). Regue apenas se estiver seco.')
  }
  passos.push('Observe folhas (frente e verso) e caule em busca de manchas, pragas ou murcha.')
  if (sp?.luminosidade) passos.push(`Confira a luz: ${sp.luminosidade}`)
  return passos.slice(0, 7)
}

function explicacao(plant: Plant): string {
  switch (plant.saude) {
    case 'crítica':
      return 'A planta mostra sinais de debilidade. Nessa fase, o mais importante é estabilizar luz, água e ventilação. Adubar ou transplantar agora pode aumentar o estresse; faça isso só depois que ela voltar a emitir folhas novas.'
    case 'atenção':
      return 'Há sinais que merecem acompanhamento. Observar com calma e registrar novas fotos ajuda a entender se o problema está evoluindo ou se foi pontual, antes de mudar a rotina.'
    default:
      return 'A planta está saudável. A rotina é manter constância: verificar o substrato antes de regar, garantir a luz adequada e acompanhar o crescimento com fotos periódicas.'
  }
}

export default function Report() {
  const { id = '' } = useParams()
  const { data, error } = useLoad(() => load(id), [id])
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (data?.plant.publica) qrDataUrl(publicPlantUrl(data.plant.codigo_publico), 256).then(setQr)
  }, [data])

  if (!data) return <main className="app">{error ? <ErrorBox error={error} /> : 'Carregando…'}</main>
  const { plant, tasks, obs, species: sp } = data
  const foto = photoUrl(plant.foto_path)
  const proxima = tasks[0]
  const proxAvaliacao = tasks.find((t) => t.tipo === 'avaliação' || t.tipo === 'foto')
  const riscos = [
    ...obs.filter((o) => o.saude && o.saude !== 'saudável').slice(0, 2).map((o) => `Observado em ${fmtDate(o.data)}: ${o.texto}`),
    sp?.pragas ? `Pragas e problemas comuns: ${sp.pragas}` : null,
  ].filter(Boolean) as string[]

  const conhecimento: [string, string | null | undefined][] = [
    ['Descrição', sp?.descricao], ['Origem', sp?.origem], ['Família botânica', sp?.familia],
    ['Luminosidade', sp?.luminosidade], ['Rega', sp?.rega], ['Substrato', sp?.substrato],
    ['Adubação / húmus', sp?.adubacao], ['Temperatura', sp?.temperatura], ['Poda', sp?.poda],
    ['Transplante', sp?.transplante], ['Floração', sp?.floracao], ['Colheita', sp?.colheita],
    ['Pragas e problemas comuns', sp?.pragas], ['Deficiências possíveis', sp?.deficiencias],
    ['Estágios de desenvolvimento', sp?.estagios], ['Usos e curiosidades', sp?.usos],
  ]

  return (
    <div className="report-root">
      <style>{`
        .report-root { background: #e9ece6; padding: 16px 0; min-height: 100vh; color: #1f2a1f; }
        .a4 { width: 210mm; min-height: 297mm; margin: 0 auto 16px; background: #fff; padding: 14mm 15mm; box-shadow: 0 2px 10px rgba(0,0,0,.15); font-size: 10pt; line-height: 1.4; overflow: hidden; }
        .a4 h1 { font-size: 18pt; margin: 0; color: #1f2a1f; }
        .a4 h2 { font-size: 11pt; margin: 10px 0 4px; color: #2f6b3a; border-bottom: 1px solid #d6e3cf; padding-bottom: 2px; }
        .a4 p, .a4 li { margin: 2px 0; }
        .rhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2f6b3a; padding-bottom: 6px; margin-bottom: 10px; }
        .rhead .marca { color: #2f6b3a; font-weight: 700; font-size: 12pt; }
        .rhead .slogan { font-size: 8pt; color: #5f6f5f; }
        .rgrid { display: grid; grid-template-columns: 62mm 1fr; gap: 6mm; }
        .rfoto { width: 62mm; height: 62mm; object-fit: cover; border-radius: 3mm; background: #e3f0dc; display: grid; place-items: center; font-size: 40pt; }
        .kv { display: grid; grid-template-columns: 34mm 1fr; gap: 1mm 3mm; }
        .kv b { color: #5f6f5f; font-weight: 600; }
        .k2 { columns: 2; column-gap: 8mm; }
        .k2 section { break-inside: avoid; margin-bottom: 6px; }
        .rfoot { margin-top: 8px; font-size: 7.5pt; color: #5f6f5f; border-top: 1px solid #d6e3cf; padding-top: 4px; display: flex; justify-content: space-between; }
        .toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 8px; padding: 0 8px; }
        @page { size: A4; margin: 0; }
        @media print {
          .report-root { background: #fff; padding: 0; }
          .a4 { margin: 0; box-shadow: none; height: 297mm; page-break-after: always; }
          .a4:last-child { page-break-after: auto; }
          .toolbar { display: none; }
        }
        @media screen and (max-width: 820px) { .a4 { transform-origin: top left; width: 210mm; } .report-root { overflow-x: auto; } }
      `}</style>

      <div className="toolbar">
        <Link className="btn" to={`/plantas/${plant.id}`}>← Voltar</Link>
        <button className="primary" onClick={() => window.print()}>🖨️ Imprimir / salvar PDF</button>
      </div>

      {/* Página 1 — Ação */}
      <div className="a4">
        <div className="rhead">
          <div><div className="marca">🌱 Jardim Vivo</div><div className="slogan">Conheça • Cuide • Veja Florescer</div></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: '13pt' }}>{plant.codigo_publico}</b><div className="slogan">Relatório de {fmtDate(todayISO())}</div></div>
        </div>
        <div className="rgrid">
          <div>
            {foto ? <img className="rfoto" src={foto} alt="" /> : <div className="rfoto">🌱</div>}
            {qr && <div style={{ textAlign: 'center', marginTop: 6 }}><img src={qr} alt="" style={{ width: '28mm' }} /><div className="slogan">Escaneie para ver o registro atualizado</div></div>}
          </div>
          <div>
            <h1>{plant.nome_comum}</h1>
            <p><i>{plant.nome_cientifico ?? 'Identificação pendente'}</i></p>
            <div className="kv" style={{ marginTop: 6 }}>
              <b>Identificação</b><span>{plant.status_identificacao}{plant.confianca != null ? ` — confiança ${plant.confianca}%` : ''}</span>
              <b>Estágio atual</b><span>{plant.estagio}</span>
              <b>Saúde</b><span>{plant.saude}</span>
              <b>Dificuldade</b><span>{plant.dificuldade ?? sp?.dificuldade ?? '—'}</span>
              <b>Plantio</b><span>{fmtDate(plant.data_plantio)}</span>
              <b>Próxima ação</b><span>{proxima ? `${proxima.titulo} (${fmtDate(proxima.vence_em)})` : '—'}</span>
              <b>Próxima avaliação</b><span>{proxAvaliacao ? fmtDate(proxAvaliacao.vence_em) : '—'}</span>
            </div>
          </div>
        </div>

        <h2>O que fazer hoje — passo a passo</h2>
        <ol>{passosHoje(plant, tasks, sp).map((p, i) => <li key={i}>{p}</li>)}</ol>

        <h2>Riscos</h2>
        {riscos.length ? <ul>{riscos.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p>Nenhum risco específico registrado no momento.</p>}

        <h2>Explicação</h2>
        <p>{explicacao(plant)}</p>

        {sp?.dica && (<><h2>Dica extra</h2><p>{sp.dica}</p></>)}

        <div className="rfoot"><span>Jardim Vivo · {plant.codigo_publico}</span><span>Página 1 de 2 — Ação</span></div>
      </div>

      {/* Página 2 — Conhecimento */}
      <div className="a4">
        <div className="rhead">
          <div><div className="marca">🌱 Jardim Vivo</div><div className="slogan">Conheça • Cuide • Veja Florescer</div></div>
          <div style={{ textAlign: 'right' }}><b>{plant.nome_comum}</b><div className="slogan"><i>{plant.nome_cientifico ?? ''}</i></div></div>
        </div>
        {sp ? (
          <div className="k2">
            {conhecimento.filter(([, v]) => v).map(([k, v]) => (
              <section key={k}><h2>{k}</h2><p>{v}</p></section>
            ))}
          </div>
        ) : (
          <p>As informações de conhecimento aparecem quando a espécie da planta é identificada e confirmada.</p>
        )}
        <p style={{ marginTop: 10, fontSize: '8pt', color: '#5f6f5f' }}>
          Orientações gerais: observe sempre o substrato e a condição real da planta antes de regar ou adubar.
          Sinais visuais indicam possibilidades, não diagnósticos confirmados. Uso culinário ou medicinal somente quando
          apropriado e com segurança.
        </p>
        <div className="rfoot"><span>Jardim Vivo · {plant.codigo_publico}</span><span>Página 2 de 2 — Conhecimento</span></div>
      </div>
    </div>
  )
}
