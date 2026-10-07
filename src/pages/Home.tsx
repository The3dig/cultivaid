import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must, careInfo } from '../lib/care'
import { addDays, daysBetween, fmtDateTime, todayISO } from '../lib/dates'
import { fetchSpecies, useLoad } from '../lib/hooks'
import type { CareEvent, Plant } from '../lib/types'
import { Empty, ErrorBox, PlantThumb, TaskItem, type TaskWithPlant } from '../components/ui'

async function load() {
  const [plants, tasks, events, species] = await Promise.all([
    supabase.from('plants').select('*').eq('ativa', true).then(must),
    supabase.from('tasks').select('*, plants(*)').is('concluida_em', null)
      .lte('vence_em', addDays(todayISO(), 7)).order('vence_em').then(must),
    supabase.from('care_events').select('*, plants(id, nome_comum)').order('data', { ascending: false }).limit(8).then(must),
    fetchSpecies(),
  ])
  return {
    plants: plants as Plant[],
    tasks: tasks as TaskWithPlant[],
    events: events as (CareEvent & { plants: { id: string; nome_comum: string } | null })[],
    species: new Map(species.map((s) => [s.id, s])),
  }
}

export default function Home() {
  const { data, error, loading, reload } = useLoad(load)
  const hoje = todayISO()

  if (loading && !data) return <div className="empty">Carregando…</div>
  if (!data) return <ErrorBox error={error} />

  const { plants, tasks, events, species } = data
  const count = (s: string) => plants.filter((p) => p.saude === s).length
  const paraHoje = tasks.filter((t) => t.vence_em <= hoje)
  const proximas = tasks.filter((t) => t.vence_em > hoje)
  const semFoto = plants.filter((p) => !p.foto_em || daysBetween(p.foto_em, hoje) > 14)
  const criticas = plants.filter((p) => p.saude === 'crítica')

  return (
    <>
      <h1>🌱 Jardim Vivo</h1>
      <p className="subtitle">Conheça • Cuide • Veja Florescer</p>
      <ErrorBox error={error} />

      <div className="stats">
        <Link className="stat" to="/plantas"><b>{plants.length}</b><span>plantas</span></Link>
        <Link className="stat" to="/plantas?saude=saudável"><b style={{ color: 'var(--ok)' }}>{count('saudável')}</b><span>saudáveis</span></Link>
        <Link className="stat" to="/plantas?saude=atenção"><b style={{ color: 'var(--warn)' }}>{count('atenção')}</b><span>em atenção</span></Link>
        <Link className="stat" to="/plantas?saude=crítica"><b style={{ color: 'var(--bad)' }}>{count('crítica')}</b><span>críticas</span></Link>
      </div>

      {criticas.length > 0 && (
        <div className="notice" style={{ marginTop: 12 }}>
          ⚠️ {criticas.map((p) => p.nome_comum).join(', ')} {criticas.length > 1 ? 'precisam' : 'precisa'} de
          atenção. Primeiro estabilize (luz, água, ventilação) antes de adubar ou transplantar.
        </div>
      )}

      <h2>Hoje ({paraHoje.length})</h2>
      {plants.length === 0 ? (
        <Empty icon="🪴">
          Nenhuma planta ainda.<br />
          <Link className="btn primary" style={{ marginTop: 12 }} to="/plantas/nova">Cadastrar primeira planta</Link>
        </Empty>
      ) : paraHoje.length === 0 ? (
        <div className="card muted">Nada pendente para hoje. 🌤️</div>
      ) : (
        <div className="list">
          {paraHoje.map((t) => <TaskItem key={t.id} task={t} species={species} onChange={reload} />)}
        </div>
      )}

      {proximas.length > 0 && (
        <>
          <h2>Próximos 7 dias</h2>
          <div className="card">
            {proximas.slice(0, 6).map((t) => (
              <div key={t.id} className="row spread small" style={{ padding: '4px 0' }}>
                <span>{t.titulo} · <Link to={`/plantas/${t.plant_id}`}>{t.plants?.nome_comum}</Link></span>
                <span className="muted">{t.vence_em.split('-').reverse().slice(0, 2).join('/')}</span>
              </div>
            ))}
            <Link to="/agenda" className="small">Ver agenda completa →</Link>
          </div>
        </>
      )}

      {semFoto.length > 0 && (
        <>
          <h2>Sem foto recente</h2>
          <div className="row" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {semFoto.map((p) => (
              <Link key={p.id} to={`/plantas/${p.id}?foto=1`} style={{ textAlign: 'center', textDecoration: 'none', color: 'inherit' }}>
                <PlantThumb plant={p} />
                <div className="small" style={{ width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome_comum}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {events.length > 0 && (
        <>
          <h2>Atividade recente</h2>
          <ul className="timeline card">
            {events.map((e) => (
              <li key={e.id}>
                <span className="ic">{careInfo(e.tipo).icon}</span>
                <div className="grow">
                  {careInfo(e.tipo).label} · <Link to={`/plantas/${e.plant_id}`}>{e.plants?.nome_comum}</Link>
                  <div className="small muted">{fmtDateTime(e.data)}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
