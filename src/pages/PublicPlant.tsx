import { useParams } from 'react-router-dom'
import { photoUrl, supabase } from '../lib/supabase'
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
  const { data, error, loading } = useLoad(async () => {
    const { data, error } = await supabase.rpc('public_plant', { p_codigo: codigo })
    if (error) throw new Error(error.message)
    return data as PublicData | null
  }, [codigo])

  if (loading) return <div className="empty">Carregando…</div>
  if (error || !data) {
    return (
      <main className="app">
        <div className="brand"><div className="logo">🌱</div><h1>Jardim Vivo</h1></div>
        <div className="empty">Registro <b>{codigo}</b> não encontrado ou não está público.</div>
      </main>
    )
  }

  const foto = photoUrl(data.foto_path)
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
      {foto ? <img className="hero" src={foto} alt={data.nome_comum} /> : <div className="hero-empty">🌱</div>}
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
