import { Fragment, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { daysBetween, fmtDate, todayISO } from '../lib/dates'
import { fetchSpecies, useLoad } from '../lib/hooks'
import { CELL_STATUS, type CellStatus, type SeedCell, type SeedTray, type Species } from '../lib/types'
import { ErrorBox, Sheet, TopBar } from '../components/ui'
import { TrayCounts, countCells, trayStats } from './Trays'

export const cellLabel = (c: Pick<SeedCell, 'linha' | 'coluna'>) => `${String.fromCharCode(65 + c.linha)}${c.coluna + 1}`

async function load(id: string) {
  const [tray, cells, species] = await Promise.all([
    supabase.from('seed_trays').select('*').eq('id', id).single().then(must),
    supabase.from('seed_cells').select('*').eq('tray_id', id).order('linha').order('coluna').then(must),
    fetchSpecies(),
  ])
  return { tray: tray as SeedTray, cells: cells as SeedCell[], species: species as Species[] }
}

export default function TrayDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, reload } = useLoad(() => load(id), [id])
  const [multi, setMulti] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<SeedCell[] | null>(null)

  if (!data) return error ? <ErrorBox error={error} /> : <div className="empty">Carregando…</div>
  const { tray, cells, species } = data
  const stats = trayStats(countCells(cells))
  const spName = (c: SeedCell) => species.find((s) => s.id === c.species_id)?.nome_comum ?? c.semente ?? ''

  function tap(c: SeedCell) {
    if (multi) setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
    else setEditing([c])
  }

  async function removeTray() {
    if (!confirm('Excluir esta sementeira e todas as células?')) return
    must(await supabase.from('seed_trays').delete().eq('id', tray.id))
    nav('/sementeiras', { replace: true })
  }

  return (
    <>
      <TopBar title={tray.nome} back="/sementeiras" />
      <div className="small muted">{tray.local}</div>
      <div className="small" style={{ margin: '8px 0 12px' }}>
        <TrayCounts s={stats} />
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <button className={multi ? 'primary' : ''} onClick={() => { setMulti(!multi); setSelected([]) }}>
          {multi ? `Selecionando (${selected.length})` : '☑️ Selecionar várias'}
        </button>
        {multi && (
          <>
            <button onClick={() => setSelected(cells.filter((c) => c.status === 'vazia').map((c) => c.id))}>Todas vazias</button>
            <button onClick={() => setSelected(cells.filter((c) => c.status === 'plantada').map((c) => c.id))}>Todas semeadas</button>
            <button onClick={() => setSelected([])}>Limpar</button>
          </>
        )}
        {multi && selected.length > 0 && (
          <button className="primary" onClick={() => setEditing(cells.filter((c) => selected.includes(c.id)))}>Editar selecionadas</button>
        )}
      </div>

      <div className="tray-grid" style={{ gridTemplateColumns: `repeat(${tray.colunas + 1}, minmax(36px, 56px))` }}>
        {cells.map((c) => (<Fragment key={c.id}>
          {c.coluna === 0 && (
            <button className="cell" style={{ background: 'transparent', fontWeight: 700 }}
              title={multi ? 'Selecionar a linha toda' : undefined}
              onClick={() => {
                if (!multi) return
                const linha = cells.filter((x) => x.linha === c.linha).map((x) => x.id)
                setSelected((s) => [...new Set([...s, ...linha])])
              }}>
              {String.fromCharCode(65 + c.linha)}
            </button>
          )}
          <button key={c.id} className={`cell ${c.status}`} onClick={() => tap(c)} title={`${cellLabel(c)} ${spName(c)}`}
            style={selected.includes(c.id) ? { outline: '3px solid var(--brand)' } : undefined}>
            {cellLabel(c)}
          </button>
        </Fragment>))}
      </div>

      <h2>Células semeadas</h2>
      <div className="card small">
        {cells.filter((c) => c.status !== 'vazia').length === 0 && <span className="muted">Toque numa célula para registrar a semeadura.</span>}
        {cells.filter((c) => c.status !== 'vazia').map((c) => (
          <div key={c.id} className="row spread" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
            <span><b>{cellLabel(c)}</b> {spName(c)} · {c.status}
              {c.data_plantio && c.data_germinacao && ` · germinou em ${daysBetween(c.data_plantio, c.data_germinacao)} dias`}
            </span>
            {c.plant_id ? <Link to={`/plantas/${c.plant_id}`}>ver planta</Link> : <span className="muted">{fmtDate(c.data_plantio)}</span>}
          </div>
        ))}
      </div>

      <button className="danger" style={{ marginTop: 20 }} onClick={removeTray}>🗑️ Excluir sementeira</button>

      {editing && (
        <CellSheet tray={tray} cells={editing} species={species}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); setSelected([]); setMulti(false); reload() }} />
      )}
    </>
  )
}

function CellSheet({ tray, cells, species, onClose, onDone }: {
  tray: SeedTray; cells: SeedCell[]; species: Species[]; onClose: () => void; onDone: () => void
}) {
  const nav = useNavigate()
  const first = cells[0]
  const multi = cells.length > 1
  // Em várias células os campos começam vazios: só o que o usuário preencher é aplicado,
  // para não copiar a espécie/datas de uma célula para as outras.
  const [speciesId, setSpeciesId] = useState(multi ? '' : first.species_id ?? '')
  const [semente, setSemente] = useState(multi ? '' : first.semente ?? '')
  const [status, setStatus] = useState<CellStatus>(first.status === 'vazia' ? 'plantada' : first.status)
  const [plantio, setPlantio] = useState(multi ? todayISO() : first.data_plantio ?? todayISO())
  const [germinacao, setGerminacao] = useState(multi ? '' : first.data_germinacao ?? '')
  const [obs, setObs] = useState(multi ? '' : first.observacoes ?? '')
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const label = cells.length > 8 ? `${cells.length} células` : cells.map(cellLabel).join(', ')
  const touch = (k: string) => setTouched((t) => new Set(t).add(k))

  async function save() {
    const ids = cells.map((c) => c.id)
    const updated_at = new Date().toISOString()
    const hoje = todayISO()
    const germinou = status === 'germinada' || status === 'muda'
    const upd = async (row: Record<string, unknown>, onlyNull?: string) => {
      let q = supabase.from('seed_cells').update({ ...row, updated_at }).in('id', ids)
      if (onlyNull) q = q.is(onlyNull, null)
      must(await q)
    }
    try {
      if (status === 'vazia') {
        await upd({ status, species_id: null, semente: null, data_plantio: null, data_germinacao: null, plant_id: null, observacoes: obs || null })
      } else if (!multi) {
        await upd({
          status, species_id: speciesId || null, semente: semente || null, data_plantio: plantio || null,
          data_germinacao: germinacao || (germinou ? hoje : null), observacoes: obs || null,
        })
      } else {
        const values: Record<string, string | null> = {
          species_id: speciesId || null, semente: semente || null, data_plantio: plantio || null,
          data_germinacao: germinacao || null, observacoes: obs || null,
        }
        const row: Record<string, unknown> = { status }
        for (const k of Object.keys(values)) if (touched.has(k) && values[k] !== null) row[k] = values[k]
        await upd(row)
        // completa só o que estiver em branco em cada célula
        if (!touched.has('data_plantio') && plantio) await upd({ data_plantio: plantio }, 'data_plantio')
        if (!touched.has('data_germinacao') && germinou) await upd({ data_germinacao: hoje }, 'data_germinacao')
      }
      onDone()
    } catch (e) { setErr((e as Error).message) }
  }

  function transplant() {
    const sp = species.find((s) => s.id === speciesId)
    const qs = new URLSearchParams({
      nome: sp?.nome_comum ?? semente ?? '',
      origem: `Sementeira ${tray.nome}, célula ${cellLabel(first)}`,
      celula: first.id,
      especie: speciesId,
      plantio: plantio,
    })
    nav(`/plantas/nova?${qs}`)
  }

  return (
    <Sheet title={`Célula ${label}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        {multi && (
          <p className="small muted">
            Editando {cells.length} células: só os campos que você alterar são aplicados; o resto de cada célula é mantido.
          </p>
        )}
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value as CellStatus); touch('status') }}>
            {CELL_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {status !== 'vazia' && (
          <>
            <div className="field">
              <label>Espécie</label>
              <select value={speciesId} onChange={(e) => { setSpeciesId(e.target.value); touch('species_id') }}>
                <option value="">{multi ? '— manter a de cada célula —' : 'Outra (descrever abaixo)'}</option>
                {species.map((s) => <option key={s.id} value={s.id}>{s.nome_comum}</option>)}
              </select>
            </div>
            <div className="field"><label>Semente / variedade</label><input value={semente} onChange={(e) => { setSemente(e.target.value); touch('semente') }} placeholder="Ex.: Tomate cereja — marca X" /></div>
            <div className="two">
              <div className="field"><label>Plantio</label><input type="date" value={plantio} onChange={(e) => { setPlantio(e.target.value); touch('data_plantio') }} /></div>
              <div className="field"><label>Germinação</label><input type="date" value={germinacao} onChange={(e) => { setGerminacao(e.target.value); touch('data_germinacao') }} /></div>
            </div>
          </>
        )}
        <div className="field"><label>Observações</label><input value={obs} onChange={(e) => { setObs(e.target.value); touch('observacoes') }} /></div>
        <ErrorBox error={err} />
        <button className="primary block">Salvar{cells.length > 1 ? ` ${cells.length} células` : ''}</button>
        {cells.length === 1 && (first.status === 'germinada' || first.status === 'muda') && !first.plant_id && (
          <button type="button" className="block" style={{ marginTop: 8 }} onClick={transplant}>
            🪴 Transplantar → criar planta com ID próprio
          </button>
        )}
      </form>
    </Sheet>
  )
}
