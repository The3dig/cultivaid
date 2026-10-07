import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { must } from '../lib/care'
import { useLoad } from '../lib/hooks'
import type { Plant } from '../lib/types'
import { Empty, ErrorBox, PlantThumb, SaudeBadge, TopBar } from '../components/ui'

const FILTROS = [
  { key: '', label: 'Todas' },
  { key: 'saudável', label: 'Saudáveis' },
  { key: 'atenção', label: 'Em atenção' },
  { key: 'crítica', label: 'Críticas' },
  { key: 'favoritas', label: '⭐ Favoritas' },
  { key: 'encerradas', label: 'Ciclo encerrado' },
]

export default function PlantList() {
  const [params, setParams] = useSearchParams()
  const filtro = params.get('saude') ?? params.get('f') ?? ''
  const [q, setQ] = useState('')
  const { data, error, loading } = useLoad(
    async () => must(await supabase.from('plants').select('*').order('created_at', { ascending: false })) as Plant[],
  )

  const termo = q.trim().toLowerCase()
  const plants = (data ?? []).filter((p) => {
    if (filtro === 'encerradas') { if (p.ativa) return false } else if (!p.ativa) return false
    if (filtro === 'favoritas' && !p.favorita) return false
    if (['saudável', 'atenção', 'crítica'].includes(filtro) && p.saude !== filtro) return false
    if (!termo) return true
    return [p.nome_comum, p.nome_cientifico, p.codigo_publico].some((v) => v?.toLowerCase().includes(termo))
  })

  return (
    <>
      <TopBar title="🌿 Minhas plantas" right={<Link className="btn primary" to="/plantas/nova">+ Nova</Link>} />
      <div className="field">
        <input type="search" placeholder="Buscar por nome, espécie ou código (JV-…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">
        {FILTROS.map((f) => (
          <button key={f.key} className={filtro === f.key ? 'on' : ''}
            onClick={() => setParams(f.key ? { f: f.key } : {})}>{f.label}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <div className="empty">Carregando…</div> : plants.length === 0 ? (
        <Empty icon="🔍">Nenhuma planta encontrada.</Empty>
      ) : (
        <div className="list">
          {plants.map((p) => (
            <Link key={p.id} to={`/plantas/${p.id}`} className="card link-card">
              <PlantThumb plant={p} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{p.favorita ? '⭐ ' : ''}{p.nome_comum}</b>
                <div className="small muted"><i>{p.nome_cientifico ?? 'espécie não definida'}</i></div>
                <div className="small muted">{p.codigo_publico} · {p.ativa ? p.estagio : `encerrada: ${p.estado_final ?? '—'}`}</div>
              </div>
              <SaudeBadge saude={p.saude} />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
