import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { useLoad } from '../lib/hooks'
import { CONTAINER_TIPOS, type Container, type Plant } from '../lib/types'
import { Empty, ErrorBox, Sheet, TopBar } from '../components/ui'

async function load() {
  const [containers, plants] = await Promise.all([
    supabase.from('containers').select('*').order('nome').then(must),
    supabase.from('plants').select('id, nome_comum, container_id').eq('ativa', true).then(must),
  ])
  return { containers: containers as Container[], plants: plants as Pick<Plant, 'id' | 'nome_comum' | 'container_id'>[] }
}

const EMPTY = { nome: '', tipo: 'vaso', tamanho: '', volume_litros: '', material: '', local: '', observacoes: '' }

export default function Containers() {
  const { data, error, reload } = useLoad(load)
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save() {
    if (!editing) return
    const { id, ...f } = editing
    const row = {
      nome: f.nome, tipo: f.tipo, tamanho: f.tamanho || null, material: f.material || null,
      local: f.local || null, observacoes: f.observacoes || null,
      volume_litros: f.volume_litros === '' ? null : Number(f.volume_litros),
    }
    try {
      must(id ? await supabase.from('containers').update(row).eq('id', id) : await supabase.from('containers').insert(row))
      setEditing(null)
      reload()
    } catch (e) { setSaveError((e as Error).message) }
  }

  async function toggle(c: Container) {
    must(await supabase.from('containers').update({ ativo: !c.ativo }).eq('id', c.id))
    reload()
  }

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setEditing((s) => s && { ...s, [k]: e.target.value })

  return (
    <>
      <TopBar title="🪴 Vasos e locais" back="/mais" right={<button className="primary" onClick={() => { setSaveError(null); setEditing({ ...EMPTY }) }}>+ Vaso</button>} />
      <p className="subtitle">O vaso é separado da planta: trocar de vaso não muda o código da planta.</p>
      <ErrorBox error={error} />
      {data && data.containers.length === 0 && <Empty icon="🪴">Nenhum recipiente cadastrado.</Empty>}
      <div className="list">
        {data?.containers.map((c) => {
          const ocupantes = data.plants.filter((p) => p.container_id === c.id)
          return (
            <div key={c.id} className="card" style={{ opacity: c.ativo ? 1 : 0.6 }}>
              <div className="row spread">
                <b>{c.nome}</b>
                <span className="badge">{c.tipo}</span>
              </div>
              <div className="small muted">
                {[c.tamanho, c.volume_litros ? `${c.volume_litros} L` : null, c.material, c.local].filter(Boolean).join(' · ') || 'sem detalhes'}
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                {ocupantes.length
                  ? ocupantes.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/plantas/${p.id}`}>{p.nome_comum}</Link></span>)
                  : <span className="muted">vazio</span>}
                {ocupantes.length > 1 && <span className="muted"> — mudas juntas competem: separe no momento adequado.</span>}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => { setSaveError(null); setEditing({ id: c.id, nome: c.nome, tipo: c.tipo, tamanho: c.tamanho ?? '', volume_litros: c.volume_litros?.toString() ?? '', material: c.material ?? '', local: c.local ?? '', observacoes: c.observacoes ?? '' }) }}>Editar</button>
                <button onClick={() => toggle(c)}>{c.ativo ? 'Arquivar' : 'Reativar'}</button>
              </div>
            </div>
          )
        })}
      </div>
      {editing && (
        <Sheet title={editing.id ? 'Editar vaso' : 'Novo vaso'} onClose={() => setEditing(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save() }}>
            <div className="field"><label>Nome / identificação *</label><input required value={editing.nome} onChange={set('nome')} placeholder="Vaso-01, Jardineira da janela…" /></div>
            <div className="two">
              <div className="field"><label>Tipo</label>
                <select value={editing.tipo} onChange={set('tipo')}>{CONTAINER_TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="field"><label>Tamanho</label><input value={editing.tamanho} onChange={set('tamanho')} placeholder="P, M, G, 20 cm…" /></div>
            </div>
            <div className="two">
              <div className="field"><label>Volume (L)</label><input type="number" min={0} step="0.1" value={editing.volume_litros} onChange={set('volume_litros')} /></div>
              <div className="field"><label>Material</label><input value={editing.material} onChange={set('material')} placeholder="Plástico, barro…" /></div>
            </div>
            <div className="field"><label>Local</label><input value={editing.local} onChange={set('local')} placeholder="Varanda, quintal, janela da cozinha…" /></div>
            <div className="field"><label>Observações</label><textarea value={editing.observacoes} onChange={set('observacoes')} /></div>
            <ErrorBox error={saveError} />
            <button className="primary block">Salvar</button>
          </form>
        </Sheet>
      )}
    </>
  )
}
