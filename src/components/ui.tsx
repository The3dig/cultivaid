import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Photo } from '../lib/photos'
import { daysBetween, relativeDay, todayISO } from '../lib/dates'
import { TASK_ICONS, completeTask, logCare, postponeTask } from '../lib/care'
import type { Plant, Saude, Species, Task } from '../lib/types'

export function SaudeBadge({ saude }: { saude: Saude }) {
  return <span className={`badge ${saude}`}>{saude}</span>
}

export function PlantThumb({ plant }: { plant: Pick<Plant, 'foto_path' | 'nome_comum'> }) {
  return <Photo path={plant.foto_path} className="thumb" alt={plant.nome_comum} loading="lazy" fallback={<div className="thumb">🌱</div>} />
}

export function TopBar({ title, back, right }: { title: string; back?: string | boolean; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
        {back && (
          typeof back === 'string'
            ? <Link className="back" to={back} aria-label="Voltar">←</Link>
            : <a className="back" href="#" onClick={(e) => { e.preventDefault(); nav(-1) }} aria-label="Voltar">←</a>
        )}
        <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error">{error}</div> : null
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="empty"><span className="ic">{icon}</span>{children}</div>
}

export type TaskWithPlant = Task & { plants: Plant | null }

/** Item de tarefa com ações rápidas adequadas ao tipo. */
export function TaskItem({ task, species, onChange, showPlant = true }: {
  task: TaskWithPlant
  species: Map<string, Species>
  onChange: () => void
  showPlant?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const late = daysBetween(task.vence_em, todayISO()) > 0
  const plant = task.plants
  const sp = plant?.species_id ? species.get(plant.species_id) ?? null : null

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try { await fn(); onChange() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.4rem' }}>{TASK_ICONS[task.tipo] ?? '📌'}</span>
        <div className="grow">
          <b>{task.titulo}</b>
          {showPlant && plant && (
            <div className="small"><Link to={`/plantas/${plant.id}`}>{plant.nome_comum}</Link> · {plant.codigo_publico}</div>
          )}
          {task.notas && <div className="small muted">{task.notas}</div>}
        </div>
        <span className={`badge ${late ? 'late' : ''}`}>{relativeDay(task.vence_em)}</span>
      </div>
      <ErrorBox error={err} />
      <div className="row" style={{ marginTop: 10 }}>
        {task.tipo === 'rega' && plant ? (
          <>
            <button className="primary" disabled={busy} onClick={() => act(() => logCare(plant, sp, 'rega'))}>💧 Reguei</button>
            <button disabled={busy} onClick={() => act(() => postponeTask(task, 1))}>Ainda úmido · ver amanhã</button>
          </>
        ) : (task.tipo === 'adubação' && plant) ? (
          <>
            <button className="primary" disabled={busy} onClick={() => act(() => logCare(plant, sp, 'húmus'))}>🪱 Apliquei</button>
            <button disabled={busy} onClick={() => act(() => postponeTask(task, 7))}>Adiar 7 dias</button>
          </>
        ) : task.tipo === 'foto' && plant ? (
          <Link className="btn primary" to={`/plantas/${plant.id}?foto=1`}>📸 Tirar foto</Link>
        ) : (
          <>
            <button className="primary" disabled={busy} onClick={() => act(() => completeTask(task))}>✓ Feito</button>
            <button disabled={busy} onClick={() => act(() => postponeTask(task, 2))}>Adiar 2 dias</button>
          </>
        )}
      </div>
    </div>
  )
}
