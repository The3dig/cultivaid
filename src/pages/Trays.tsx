import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { useLoad } from '../lib/hooks'
import type { SeedCell, SeedTray } from '../lib/types'
import { Empty, ErrorBox, Sheet, TopBar } from '../components/ui'

async function load() {
  const [trays, cells] = await Promise.all([
    supabase.from('seed_trays').select('*').order('created_at', { ascending: false }).then(must),
    supabase.from('seed_cells').select('tray_id, status').then(must),
  ])
  return { trays: trays as SeedTray[], cells: cells as Pick<SeedCell, 'tray_id' | 'status'>[] }
}

export function trayStats(cells: Pick<SeedCell, 'status'>[]) {
  const c = (s: string) => cells.filter((x) => x.status === s).length
  const plantadas = c('plantada'), germinadas = c('germinada'), perdidas = c('perdida'), transplantadas = c('transplantada')
  const semeadas = plantadas + germinadas + perdidas + transplantadas
  const sucesso = germinadas + transplantadas
  return {
    vazias: c('vazia'), plantadas, germinadas, perdidas, transplantadas,
    taxa: semeadas ? Math.round((sucesso / semeadas) * 100) : null,
  }
}

export default function Trays() {
  const { data, error, reload } = useLoad(load)
  const [creating, setCreating] = useState(false)
  const [nome, setNome] = useState('')
  const [linhas, setLinhas] = useState(4)
  const [colunas, setColunas] = useState(6)
  const [local, setLocal] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    try {
      const tray = must(await supabase.from('seed_trays').insert({ nome, linhas, colunas, local: local || null }).select().single()) as SeedTray
      const cells = []
      for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) cells.push({ tray_id: tray.id, linha: l, coluna: c })
      must(await supabase.from('seed_cells').insert(cells))
      setCreating(false)
      setNome('')
      reload()
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <>
      <TopBar title="🌱 Sementeiras" right={<button className="primary" onClick={() => { setErr(null); setCreating(true) }}>+ Sementeira</button>} />
      <p className="subtitle">Acompanhe cada célula: semeadura, germinação, perdas e transplante.</p>
      <ErrorBox error={error} />
      {data && data.trays.length === 0 && <Empty icon="🌱">Nenhuma sementeira ainda.</Empty>}
      <div className="list">
        {data?.trays.map((t) => {
          const s = trayStats(data.cells.filter((c) => c.tray_id === t.id))
          return (
            <Link key={t.id} to={`/sementeiras/${t.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row spread"><b>{t.nome}</b><span className="badge">{t.linhas * t.colunas} células</span></div>
              <div className="small muted">{t.local ?? ''}</div>
              <div className="small" style={{ marginTop: 6 }}>
                🟤 {s.plantadas} plantadas · 🌱 {s.germinadas} germinadas · 🪴 {s.transplantadas} transplantadas · ❌ {s.perdidas} perdidas
                {s.taxa != null && <> · <b>{s.taxa}% sucesso</b></>}
              </div>
            </Link>
          )
        })}
      </div>
      {creating && (
        <Sheet title="Nova sementeira" onClose={() => setCreating(false)}>
          <form onSubmit={(e) => { e.preventDefault(); create() }}>
            <div className="field"><label>Nome *</label><input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Bandeja 24 células — março" /></div>
            <div className="two">
              <div className="field"><label>Linhas</label><input type="number" min={1} max={26} value={linhas} onChange={(e) => setLinhas(Number(e.target.value))} /></div>
              <div className="field"><label>Colunas</label><input type="number" min={1} max={30} value={colunas} onChange={(e) => setColunas(Number(e.target.value))} /></div>
            </div>
            <div className="field"><label>Local</label><input value={local} onChange={(e) => setLocal(e.target.value)} /></div>
            <ErrorBox error={err} />
            <button className="primary block">Criar com {linhas * colunas} células</button>
          </form>
        </Sheet>
      )}
    </>
  )
}
