import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Photo, usePhotoUrl } from '../lib/photos'
import {
  CARE_TYPES, addObservation, careInfo, logCare, moveToContainer, must, uploadPhoto,
} from '../lib/care'
import { fmtDate, fmtDateTime, todayISO } from '../lib/dates'
import { fetchContainers, fetchSpecies, useLoad } from '../lib/hooks'
import {
  ESTADOS_FINAIS, ESTAGIOS, SAUDES, type EstadoFinal,
  type CareEvent, type CareTipo, type Container, type ContainerMove, type Observation,
  type Plant, type PlantPhoto, type Saude, type Species,
} from '../lib/types'
import { Empty, ErrorBox, SaudeBadge, Sheet, TaskItem, TopBar, type TaskWithPlant } from '../components/ui'

async function load(id: string) {
  const [plant, events, obs, photos, moves, tasks, species, containers] = await Promise.all([
    supabase.from('plants').select('*').eq('id', id).single().then(must),
    supabase.from('care_events').select('*').eq('plant_id', id).order('data', { ascending: false }).then(must),
    supabase.from('observations').select('*').eq('plant_id', id).order('data', { ascending: false }).then(must),
    supabase.from('plant_photos').select('*').eq('plant_id', id).order('tirada_em', { ascending: false }).then(must),
    supabase.from('plant_container_history').select('*').eq('plant_id', id).order('data', { ascending: false }).then(must),
    supabase.from('tasks').select('*, plants(*)').eq('plant_id', id).is('concluida_em', null).order('vence_em').then(must),
    fetchSpecies(),
    fetchContainers(),
  ])
  const p = plant as Plant
  return {
    plant: p,
    events: events as CareEvent[],
    obs: obs as Observation[],
    photos: photos as PlantPhoto[],
    moves: moves as ContainerMove[],
    tasks: tasks as TaskWithPlant[],
    species: (species as Species[]).find((s) => s.id === p.species_id) ?? null,
    speciesMap: new Map((species as Species[]).map((s) => [s.id, s])),
    containers: containers as Container[],
  }
}

type SheetKind = null | 'care' | 'foto' | 'obs' | 'vaso' | 'encerrar'

export default function PlantDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useLoad(() => load(id), [id])
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [careTipo, setCareTipo] = useState<CareTipo>('rega')
  const [tab, setTab] = useState<'linha' | 'fotos' | 'guia'>('linha')

  useEffect(() => {
    if (params.get('foto')) { setSheet('foto'); setParams({}, { replace: true }) }
  }, [params, setParams])

  if (loading && !data) return <div className="empty">Carregando…</div>
  if (!data) return <ErrorBox error={error} />
  const { plant, species, containers } = data
  const container = containers.find((c) => c.id === plant.container_id)
  const close = () => { setSheet(null); reload() }

  function openCare(t: CareTipo) { setCareTipo(t); setSheet('care') }

  async function changeEstagio(estagio: string) {
    try {
      must(await supabase.from('plants').update({ estagio }).eq('id', plant.id))
      must(await supabase.from('observations').insert({ plant_id: plant.id, texto: `Estágio alterado de ${plant.estagio} para ${estagio}.` }))
    } catch (e) {
      alert(`Não foi possível alterar o estágio: ${(e as Error).message}`)
    }
    reload()
  }

  async function remove() {
    const msg = `Excluir apaga ${plant.nome_comum} (${plant.codigo_publico}) e TODO o histórico, sem volta.\n\n` +
      'Se a planta morreu ou terminou o ciclo, use “Encerrar ciclo”: o histórico fica guardado.\n\n' +
      `Para excluir mesmo assim (ex.: cadastro feito por engano), digite ${plant.codigo_publico}:`
    if (prompt(msg)?.trim().toUpperCase() !== plant.codigo_publico) return
    must(await supabase.from('plants').delete().eq('id', plant.id))
    nav('/plantas', { replace: true })
  }

  return (
    <>
      <TopBar title={plant.nome_comum} back="/plantas"
        right={<Link className="btn" to={`/plantas/${plant.id}/editar`}>Editar</Link>} />
      <ErrorBox error={error} />
      <Photo path={plant.foto_path} className="hero" alt={plant.nome_comum} fallback={<div className="hero-empty">🌱</div>} />

      <div style={{ margin: '12px 0' }}>
        <div className="muted"><i>{plant.nome_cientifico ?? 'Espécie não definida'}</i></div>
        <div className="row small" style={{ marginTop: 6 }}>
          <span className="badge">{plant.codigo_publico}</span>
          <SaudeBadge saude={plant.saude} />
          <span className="badge">{plant.estagio}</span>
          <span className="badge">ID: {plant.status_identificacao}{plant.confianca != null ? ` · ${plant.confianca}%` : ''}</span>
          {!plant.ativa && (
            <span className="badge late">
              encerrada{plant.estado_final ? `: ${plant.estado_final}` : ''} · {fmtDate(plant.encerrada_em)}
            </span>
          )}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          🪴 {container ? `${container.nome}${container.local ? ` — ${container.local}` : ''}` : 'sem vaso'} ·
          🗓️ plantio {fmtDate(plant.data_plantio)}
        </div>
      </div>

      {plant.ativa && (
        <div className="quick">
          <button onClick={() => openCare('rega')}><span className="ic">💧</span>Reguei</button>
          <button onClick={() => openCare('húmus')}><span className="ic">🪱</span>Adubei</button>
          <button onClick={() => setSheet('foto')}><span className="ic">📸</span>Foto</button>
          <button onClick={() => setSheet('obs')}><span className="ic">📝</span>Observar</button>
          <button onClick={() => openCare('poda')}><span className="ic">✂️</span>Podei</button>
          <button onClick={() => setSheet('vaso')}><span className="ic">🪴</span>Trocar vaso</button>
          <button onClick={() => openCare('colheita')}><span className="ic">🧺</span>Colhi</button>
          <button onClick={() => openCare('outro')}><span className="ic">➕</span>Outro</button>
        </div>
      )}

      {plant.saude === 'crítica' && (
        <div className="notice" style={{ marginTop: 12 }}>
          Planta debilitada: primeiro estabilize (luz adequada, água conforme o substrato, ventilação).
          Não presuma que adubo ou transplante sejam a solução.
        </div>
      )}

      {data.tasks.length > 0 && (
        <>
          <h2>Próximas ações</h2>
          <div className="list">
            {data.tasks.map((t) => (
              <TaskItem key={t.id} task={t} species={data.speciesMap} onChange={reload} showPlant={false} />
            ))}
          </div>
        </>
      )}

      <div className="tabs">
        <button className={tab === 'linha' ? 'on' : ''} onClick={() => setTab('linha')}>📜 Linha do tempo</button>
        <button className={tab === 'fotos' ? 'on' : ''} onClick={() => setTab('fotos')}>📸 Fotos ({data.photos.length})</button>
        <button className={tab === 'guia' ? 'on' : ''} onClick={() => setTab('guia')}>📖 Como cuidar</button>
      </div>

      {tab === 'linha' && <Timeline data={data} />}
      {tab === 'fotos' && (data.photos.length === 0
        ? <Empty icon="📷">Sem fotos ainda. Fotos periódicas ajudam a comparar a evolução.</Empty>
        : (
          <div className="photos">
            {data.photos.map((ph) => <PhotoLink key={ph.id} photo={ph} />)}
          </div>
        ))}
      {tab === 'guia' && <Guide species={species} />}

      <h2>Mais</h2>
      <div className="stack">
        <div className="field">
          <label>Atualizar estágio</label>
          <select value={plant.estagio} onChange={(e) => changeEstagio(e.target.value)}>
            {ESTAGIOS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="two">
          <Link className="btn" to={`/plantas/${plant.id}/relatorio`}>📄 Relatório A4</Link>
          <Link className="btn" to={`/plantas/${plant.id}/etiqueta`}>🔖 QR / etiqueta</Link>
        </div>
        <div className="two">
          {plant.ativa
            ? <button onClick={() => setSheet('encerrar')}>🏁 Encerrar ciclo</button>
            : <button onClick={async () => {
                must(await supabase.from('plants').update({ ativa: true, encerrada_em: null, motivo_encerramento: null, estado_final: null }).eq('id', plant.id))
                must(await supabase.from('observations').insert({ plant_id: plant.id, texto: 'Planta reativada (ciclo reaberto).' }))
                reload()
              }}>↩️ Reativar</button>}
          <button className="danger" onClick={remove}>🗑️ Excluir</button>
        </div>
      </div>

      {sheet === 'care' && <CareSheet plant={plant} species={species} tipo={careTipo} onDone={close} onClose={() => setSheet(null)} />}
      {sheet === 'foto' && <PhotoSheet plant={plant} onDone={close} onClose={() => setSheet(null)} />}
      {sheet === 'obs' && <ObsSheet plant={plant} onDone={close} onClose={() => setSheet(null)} />}
      {sheet === 'vaso' && <MoveSheet plant={plant} species={species} containers={containers} onDone={close} onClose={() => setSheet(null)} />}
      {sheet === 'encerrar' && <EndSheet plant={plant} onDone={close} onClose={() => setSheet(null)} />}
    </>
  )
}

function PhotoLink({ photo }: { photo: PlantPhoto }) {
  const url = usePhotoUrl(photo.storage_path)
  if (!url) return <div className="thumb" style={{ width: '100%', aspectRatio: '1', height: 'auto' }}>📷</div>
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`${fmtDate(photo.tirada_em)}${photo.legenda ? ` — ${photo.legenda}` : ''}`}>
      <img src={url} alt={photo.legenda ?? ''} loading="lazy" />
    </a>
  )
}

function Timeline({ data }: { data: Awaited<ReturnType<typeof load>> }) {
  const name = (cid: string | null) => data.containers.find((c) => c.id === cid)?.nome ?? 'sem vaso'
  const items: { key: string; date: string; icon: string; body: ReactNode }[] = [
    ...data.events.map((e) => ({
      key: 'e' + e.id, date: e.data, icon: careInfo(e.tipo).icon,
      body: <><b>{careInfo(e.tipo).label}</b>{e.quantidade && ` · ${e.quantidade}`}{e.notas && <div className="small">{e.notas}</div>}</>,
    })),
    ...data.obs.map((o) => ({
      key: 'o' + o.id, date: o.data, icon: '📝',
      body: <>{o.texto} {o.saude && <SaudeBadge saude={o.saude} />}</>,
    })),
    ...data.photos.map((p) => ({
      key: 'p' + p.id, date: p.tirada_em, icon: '📸',
      body: <>{p.legenda ?? 'Foto'}<br /><Photo path={p.storage_path} alt="" loading="lazy" /></>,
    })),
    ...data.moves.map((m) => ({
      key: 'm' + m.id, date: m.data, icon: '🪴',
      body: <>{m.from_container_id ? `${name(m.from_container_id)} → ` : 'Colocada em '}{name(m.to_container_id)}{m.motivo && <div className="small">{m.motivo}</div>}</>,
    })),
    { key: 'cad', date: data.plant.created_at, icon: '🌱', body: <>Cadastro da planta ({data.plant.codigo_publico})</> },
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <ul className="timeline">
      {items.map((i) => (
        <li key={i.key}>
          <span className="ic">{i.icon}</span>
          <div className="grow">{i.body}<div className="small muted">{fmtDateTime(i.date)}</div></div>
        </li>
      ))}
    </ul>
  )
}

function Guide({ species }: { species: Species | null }) {
  if (!species) {
    return <Empty icon="📖">Associe uma espécie do catálogo (em Editar) para ver o guia de cuidados.</Empty>
  }
  const rows: [string, string | null][] = [
    ['☀️ Luminosidade', species.luminosidade], ['💧 Rega', species.rega], ['🪨 Substrato', species.substrato],
    ['🪱 Adubação/húmus', species.adubacao], ['🌡️ Temperatura', species.temperatura], ['✂️ Poda', species.poda],
    ['🪴 Transplante', species.transplante], ['🌸 Floração', species.floracao], ['🧺 Colheita', species.colheita],
    ['🐛 Pragas e problemas', species.pragas], ['💡 Dica', species.dica],
  ]
  return (
    <div className="stack">
      {species.descricao && <p>{species.descricao}</p>}
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="card"><h3>{k}</h3><div className="small">{v}</div></div>
      ))}
    </div>
  )
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>) => async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { await fn(); onDone() } catch (err) { setError((err as Error).message); setBusy(false) }
  }
  return { busy, error, run }
}

interface SheetProps { plant: Plant; onDone: () => void; onClose: () => void }

function CareSheet({ plant, species, tipo: initial, onDone, onClose }: SheetProps & { species: Species | null; tipo: CareTipo }) {
  const [tipo, setTipo] = useState<CareTipo>(initial)
  const [quantidade, setQuantidade] = useState('')
  const [notas, setNotas] = useState('')
  const [data, setData] = useState(todayISO())
  const { busy, error, run } = useSubmit(onDone)
  const info = careInfo(tipo)
  const isToday = data === todayISO()
  return (
    <Sheet title={`${info.icon} Registrar cuidado`} onClose={onClose}>
      <form onSubmit={run(() => logCare(plant, species, tipo, {
        quantidade, notas, data: isToday ? undefined : new Date(data + 'T12:00:00').toISOString(),
      }))}>
        <div className="field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as CareTipo)}>
            {CARE_TYPES.map((c) => <option key={c.tipo} value={c.tipo}>{c.icon} {c.label}</option>)}
          </select>
        </div>
        {tipo === 'rega' && species?.rega && <div className="notice small" style={{ marginBottom: 12 }}>💡 {species.rega}</div>}
        {(tipo === 'adubação' || tipo === 'húmus') && plant.saude === 'crítica' && (
          <div className="notice small" style={{ marginBottom: 12 }}>Planta debilitada: adubar agora pode piorar. Estabilize antes.</div>
        )}
        <div className="two">
          <div className="field">
            <label>Data</label>
            <input type="date" value={data} max={todayISO()} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="field">
            <label>Quantidade</label>
            <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder={tipo === 'rega' ? '200 ml' : tipo === 'colheita' ? '150 g' : ''} />
          </div>
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <button className="primary block" disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</button>
      </form>
    </Sheet>
  )
}

function PhotoSheet({ plant, onDone, onClose }: SheetProps) {
  const [file, setFile] = useState<File | null>(null)
  const [legenda, setLegenda] = useState('')
  const { busy, error, run } = useSubmit(onDone)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  return (
    <Sheet title="📸 Nova foto" onClose={onClose}>
      <form onSubmit={run(() => uploadPhoto(plant, file!, legenda))}>
        <div className="field">
          <input type="file" accept="image/*" capture="environment" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {preview && <img className="hero" src={preview} alt="prévia" style={{ marginBottom: 12 }} />}
        <div className="field">
          <label>Legenda</label>
          <input value={legenda} onChange={(e) => setLegenda(e.target.value)} placeholder="Ex.: primeira flor" />
        </div>
        <p className="small muted">Dica: fotografe sempre do mesmo ângulo e com boa luz para comparar a evolução.</p>
        <ErrorBox error={error} />
        <button className="primary block" disabled={busy || !file}>{busy ? 'Enviando…' : 'Salvar foto'}</button>
      </form>
    </Sheet>
  )
}

function ObsSheet({ plant, onDone, onClose }: SheetProps) {
  const [texto, setTexto] = useState('')
  const [saude, setSaude] = useState<Saude | ''>('')
  const { busy, error, run } = useSubmit(onDone)
  const sinais = ['Folhas amarelas', 'Folhas secas', 'Murcha', 'Estiolada (esticada)', 'Possível praga', 'Substrato encharcado', 'Substrato muito seco', 'Novo broto', 'Botão floral']
  return (
    <Sheet title="📝 Observação" onClose={onClose}>
      <form onSubmit={run(() => addObservation(plant, texto, saude || null))}>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {sinais.map((s) => (
            <button type="button" key={s} onClick={() => setTexto((t) => (t ? `${t}; ${s.toLowerCase()}` : s))}>{s}</button>
          ))}
        </div>
        <div className="field">
          <textarea required value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que você observou?" />
        </div>
        <div className="field">
          <label>Avaliação de saúde (opcional)</label>
          <select value={saude} onChange={(e) => setSaude(e.target.value as Saude | '')}>
            <option value="">Manter ({plant.saude})</option>
            {SAUDES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <p className="small muted">Observação visual não é diagnóstico confirmado. Se houver dúvida, registre e acompanhe com novas fotos.</p>
        <ErrorBox error={error} />
        <button className="primary block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Sheet>
  )
}

function MoveSheet({ plant, species, containers, onDone, onClose }: SheetProps & { species: Species | null; containers: Container[] }) {
  const [to, setTo] = useState('')
  const [motivo, setMotivo] = useState('')
  const { busy, error, run } = useSubmit(onDone)
  const options = containers.filter((c) => c.ativo && c.id !== plant.container_id)
  return (
    <Sheet title="🪴 Trocar vaso" onClose={onClose}>
      <form onSubmit={run(() => moveToContainer(plant, species, to || null, motivo))}>
        <p className="small muted">O código {plant.codigo_publico} continua o mesmo; a mudança fica no histórico.</p>
        <div className="field">
          <label>Novo recipiente</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="" disabled>Escolha…</option>
            {options.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.tamanho ? ` (${c.tamanho})` : ''}{c.local ? ` — ${c.local}` : ''}</option>)}
          </select>
          <div className="small"><Link to="/vasos">+ Cadastrar novo vaso</Link></div>
        </div>
        <div className="field">
          <label>Motivo</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Raízes saindo pelo furo, vaso maior…" />
        </div>
        <ErrorBox error={error} />
        <button className="primary block" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar troca'}</button>
      </form>
    </Sheet>
  )
}

function EndSheet({ plant, onDone, onClose }: SheetProps) {
  const [estado, setEstado] = useState<EstadoFinal>(plant.saude === 'crítica' ? 'morta' : 'colhida')
  const [detalhe, setDetalhe] = useState('')
  const [data, setData] = useState(todayISO())
  const { busy, error, run } = useSubmit(onDone)
  const label = ESTADOS_FINAIS.find((e) => e.valor === estado)!.label
  return (
    <Sheet title="🏁 Encerrar ciclo" onClose={onClose}>
      <form onSubmit={run(async () => {
        const motivo = detalhe ? `${label} — ${detalhe}` : label
        must(await supabase.from('plants').update({ ativa: false, encerrada_em: data, estado_final: estado, motivo_encerramento: motivo }).eq('id', plant.id))
        must(await supabase.from('observations').insert({
          plant_id: plant.id, texto: `Ciclo encerrado: ${motivo}.`, data: new Date(data + 'T12:00:00').toISOString(),
        }))
        must(await supabase.from('tasks').update({ concluida_em: new Date().toISOString() }).eq('plant_id', plant.id).is('concluida_em', null))
      })}>
        <p className="small muted">
          Nada é apagado: cadastro, fotos, cuidados, observações e histórico ficam guardados. A planta só sai da lista
          ativa e da agenda.
        </p>
        <div className="field">
          <label>Estado final</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFinal)}>
            {ESTADOS_FINAIS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Detalhe (opcional)</label>
          <input value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder={estado === 'morta' ? 'Ex.: apodreceu a raiz, excesso de água' : ''} />
        </div>
        <div className="field">
          <label>Data</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <button className="primary block" disabled={busy}>Encerrar</button>
      </form>
    </Sheet>
  )
}
