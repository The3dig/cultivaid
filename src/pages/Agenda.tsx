import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { addDays, todayISO } from '../lib/dates'
import { fetchSpecies, useLoad } from '../lib/hooks'
import type { Plant } from '../lib/types'
import { Empty, ErrorBox, Sheet, TaskItem, TopBar, type TaskWithPlant } from '../components/ui'

async function load() {
  const [tasks, species, plants] = await Promise.all([
    supabase.from('tasks').select('*, plants(*)').is('concluida_em', null).order('vence_em').then(must),
    fetchSpecies(),
    supabase.from('plants').select('id, nome_comum').eq('ativa', true).order('nome_comum').then(must),
  ])
  return {
    tasks: tasks as TaskWithPlant[],
    species: new Map(species.map((s) => [s.id, s])),
    plants: plants as Pick<Plant, 'id' | 'nome_comum'>[],
  }
}

export default function Agenda() {
  const { data, error, loading, reload } = useLoad(load)
  const [adding, setAdding] = useState(false)
  const hoje = todayISO()
  const semana = addDays(hoje, 7)

  if (loading && !data) return <div className="empty">Carregando…</div>
  const tasks = data?.tasks ?? []
  const groups = [
    { title: '⏰ Atrasadas', items: tasks.filter((t) => t.vence_em < hoje) },
    { title: '📅 Hoje', items: tasks.filter((t) => t.vence_em === hoje) },
    { title: '🗓️ Próximos 7 dias', items: tasks.filter((t) => t.vence_em > hoje && t.vence_em <= semana) },
    { title: '🔭 Mais adiante', items: tasks.filter((t) => t.vence_em > semana) },
  ]

  return (
    <>
      <TopBar title="💧 Agenda de cuidados" right={<button className="primary" onClick={() => setAdding(true)}>+ Tarefa</button>} />
      <p className="subtitle">Lembretes para verificar — sempre observe o substrato e a planta antes de agir.</p>
      <ErrorBox error={error} />
      {tasks.length === 0 && <Empty icon="✅">Nenhuma tarefa pendente.</Empty>}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.title}>
          <h2>{g.title} ({g.items.length})</h2>
          <div className="list">
            {g.items.map((t) => <TaskItem key={t.id} task={t} species={data!.species} onChange={reload} />)}
          </div>
        </section>
      ))}
      {adding && data && <NewTask plants={data.plants} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </>
  )
}

function NewTask({ plants, onClose, onDone }: { plants: Pick<Plant, 'id' | 'nome_comum'>[]; onClose: () => void; onDone: () => void }) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? '')
  const [tipo, setTipo] = useState('outro')
  const [titulo, setTitulo] = useState('')
  const [vence, setVence] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title="Nova tarefa" onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault()
        try {
          must(await supabase.from('tasks').insert({ plant_id: plantId || null, tipo, titulo, vence_em: vence }))
          onDone()
        } catch (err) { setError((err as Error).message) }
      }}>
        <div className="field">
          <label>Planta</label>
          <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
            <option value="">Geral (sem planta)</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.nome_comum}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {['outro', 'poda', 'transplante', 'avaliação', 'colheita', 'foto'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>O que fazer</label>
          <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Colocar tutor no tomateiro" />
        </div>
        <div className="field">
          <label>Quando</label>
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <button className="primary block">Adicionar</button>
      </form>
    </Sheet>
  )
}
