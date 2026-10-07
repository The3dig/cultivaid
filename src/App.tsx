import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import PlantList from './pages/PlantList'
import PlantForm from './pages/PlantForm'
import PlantDetail from './pages/PlantDetail'
import Report from './pages/Report'
import QrLabel from './pages/QrLabel'
import Agenda from './pages/Agenda'
import Containers from './pages/Containers'
import Trays from './pages/Trays'
import TrayDetail from './pages/TrayDetail'
import More from './pages/More'
import PublicPlant from './pages/PublicPlant'

function Layout() {
  const items = [
    { to: '/', icon: '🏠', label: 'Início', end: true },
    { to: '/plantas', icon: '🌿', label: 'Plantas' },
    { to: '/agenda', icon: '💧', label: 'Agenda' },
    { to: '/sementeiras', icon: '🌱', label: 'Sementeiras' },
    { to: '/mais', icon: '☰', label: 'Mais' },
  ]
  return (
    <>
      <main className="app"><Outlet /></main>
      <nav className="nav">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <span className="ic">{i.icon}</span>{i.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <div className="empty">Carregando…</div>
  if (!session) return <Login />
  return <Outlet />
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <main className="app">
        <h1>🌱 Jardim Vivo</h1>
        <div className="notice">
          Configure o Supabase: copie <code>.env.example</code> para <code>.env.local</code> e
          preencha <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      </main>
    )
  }
  return (
    <Routes>
      <Route path="/p/:codigo" element={<PublicPlant />} />
      <Route element={<RequireAuth />}>
        <Route path="/plantas/:id/relatorio" element={<Report />} />
        <Route path="/plantas/:id/etiqueta" element={<QrLabel />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/plantas" element={<PlantList />} />
          <Route path="/plantas/nova" element={<PlantForm />} />
          <Route path="/plantas/:id" element={<PlantDetail />} />
          <Route path="/plantas/:id/editar" element={<PlantForm />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/vasos" element={<Containers />} />
          <Route path="/sementeiras" element={<Trays />} />
          <Route path="/sementeiras/:id" element={<TrayDetail />} />
          <Route path="/mais" element={<More />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
