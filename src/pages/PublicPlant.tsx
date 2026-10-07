import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Photo } from '../lib/photos'
import { careInfo } from '../lib/care'
import { fmtDate } from '../lib/dates'
import { useLoad } from '../lib/hooks'
import type { Saude } from '../lib/types'
import { SaudeBadge } from '../components/ui'

interface PublicData {
  codigo_publico: string
  nome_comum: string
  nome_cientifico: string | null
  confianca: number | null
  status_identificacao: string
  estagio: string
  saude: Saude
  foto_path: string | null
  atualizado_em: string
  especie: { luminosidade: string | null; rega: string | null; substrato: string | null; adubacao: string | null; dica: string | null } | null
  cuidados: { tipo: string; data: string }[]
}

export default function PublicPlant() {
  const { codigo = '' } = useParams()
  const { session, loading: authLoading } = useAuth()
  const { data, error, loading } = useLoad(async () => {
    // Dono logado escaneando a própria etiqueta: abre o registro completo
    if (session) {
      const { data: own } = await supabase.from('plants').select('id').eq('codigo_publico', codigo.toUpperCase()).maybeSingle()
      if (own) return { ownId: own.id as string, pub: null }
    }
    const { data, error } = await supabase.rpc('public_plant', { p_codigo: codigo })
    if (error) throw new Error(error.message)
    return { ownId: null, pub: data as PublicData | null }
  }, [codigo, session?.user.id, authLoading])

  if (loading || authLoading) return <div className="empty">Carregando…</div>
  if (data?.ownId) return <Navigate to={`/plantas/${data.ownId}`} replace />
  return <PublicView codigo={codigo} data={data?.pub ?? null} error={error} />
}

function PublicView({ codigo, data, error }: { codigo: string; data: PublicData | null; error: string | null }) {
  if (error || !data) {
    return (
      <main className="app">
        <div className="brand"><div className="logo">🌱</div><h1>Jardim Vivo</h1></div>
        <div className="empty">
          Registro <b>{codigo}</b> não encontrado ou não está público.
          <p className="small">É uma planta sua? <a href="/">Entre na sua conta</a> e escaneie de novo.</p>
        </div>
      </main>
    )
  }

  const cuidados: [string, string | null][] = data.especie ? [
    ['☀️ Luz', data.especie.luminosidade], ['💧 Rega', data.especie.rega],
    ['🪨 Substrato', data.especie.substrato], ['🪱 Adubação', data.especie.adubacao], ['💡 Dica', data.especie.dica],
  ] : []

  return (
    <main className="app" style={{ paddingBottom: 24 }}>
      <div className="small" style={{ color: 'var(--brand)', fontWeight: 600 }}>🌱 Jardim Vivo · Conheça • Cuide • Veja Florescer</div>
      <h1 style={{ marginTop: 8 }}>{data.nome_comum}</h1>
      <div className="muted"><i>{data.nome_cientifico ?? 'identificação pendente'}</i></div>
      <div className="row small" style={{ margin: '8px 0 12px' }}>
        <span className="badge">{data.codigo_publico}</span>
        <SaudeBadge saude={data.saude} />
        <span className="badge">{data.estagio}</span>
        {data.confianca != null && <span className="badge">confiança {data.confianca}%</span>}
      </div>
      <Photo path={data.foto_path} className="hero" alt={data.nome_comum} fallback={<div className="hero-empty">🌱</div>} />
      <p className="small muted">Atualizado em {fmtDate(data.atualizado_em)}</p>

      {cuidados.some(([, v]) => v) && <h2>Cuidados essenciais</h2>}
      <div className="stack">
        {cuidados.filter(([, v]) => v).map(([k, v]) => <div className="card" key={k}><h3>{k}</h3><div className="small">{v}</div></div>)}
      </div>

      {data.cuidados.length > 0 && (
        <>
          <h2>Últimos cuidados</h2>
          <ul className="timeline card">
            {data.cuidados.map((c, i) => (
              <li key={i}><span className="ic">{careInfo(c.tipo).icon}</span><div className="grow">{careInfo(c.tipo).label}<div className="small muted">{fmtDate(c.data)}</div></div></li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
