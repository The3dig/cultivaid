import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { TopBar } from '../components/ui'

export default function More() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setErro(null)
    const { data } = await supabase.from('plants').select('id').eq('codigo_publico', codigo.trim().toUpperCase()).maybeSingle()
    if (data) nav(`/plantas/${data.id}`)
    else setErro('Nenhuma planta sua com esse código.')
  }

  const links = [
    { to: '/vasos', icon: '🪴', label: 'Vasos e locais' },
    { to: '/plantas?f=encerradas', icon: '🏁', label: 'Plantas com ciclo encerrado' },
    { to: '/plantas?f=favoritas', icon: '⭐', label: 'Favoritas' },
    { to: '/sementeiras', icon: '🌱', label: 'Sementeiras' },
    { to: '/agenda', icon: '💧', label: 'Agenda de cuidados' },
  ]

  return (
    <>
      <TopBar title="☰ Mais" />
      <div className="card">
        <b>👤 {session?.user.user_metadata?.nome ?? 'Minha conta'}</b>
        <div className="small muted">{session?.user.email}</div>
      </div>

      <h2>🔖 Abrir registro por código</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); abrir() }}>
        <input className="grow" style={{ width: 'auto' }} placeholder="JV-000001" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <button className="primary">Abrir</button>
      </form>
      {erro && <div className="small" style={{ color: 'var(--bad)' }}>{erro}</div>}
      <p className="small muted">Etiqueta perdida ou molhada? O registro continua no banco — busque pelo código ou pelo nome.</p>

      <h2>Atalhos</h2>
      <div className="list">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="card link-card"><span style={{ fontSize: '1.4rem' }}>{l.icon}</span>{l.label}</Link>
        ))}
      </div>

      <h2>Instalar no celular</h2>
      <p className="small muted">
        Android (Chrome): menu ⋮ → “Instalar app”. iPhone (Safari): compartilhar → “Adicionar à Tela de Início”.
        No Mac/Windows, use o ícone de instalar na barra de endereço do Chrome ou Edge.
      </p>

      <button className="block" style={{ marginTop: 16 }} onClick={() => supabase.auth.signOut()}>Sair</button>
    </>
  )
}
