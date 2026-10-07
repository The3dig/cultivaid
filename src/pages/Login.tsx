import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBox } from '../components/ui'

export default function Login() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    const res = mode === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } })
    setBusy(false)
    if (res.error) return setError(res.error.message)
    if (mode === 'criar' && !res.data.session) {
      setInfo('Conta criada! Confira seu e-mail para confirmar o cadastro e depois entre.')
      setMode('entrar')
    }
  }

  return (
    <div className="login">
      <div className="card">
        <div className="brand">
          <div className="logo">🌱</div>
          <h1>Jardim Vivo</h1>
          <div className="slogan">Conheça • Cuide • Veja Florescer</div>
        </div>
        <form onSubmit={submit}>
          {mode === 'criar' && (
            <div className="field">
              <label htmlFor="nome">Seu nome</label>
              <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" required minLength={6} value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} />
          </div>
          <ErrorBox error={error} />
          {info && <div className="notice" style={{ marginBottom: 10 }}>{info}</div>}
          <button className="primary block" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <p className="small" style={{ textAlign: 'center' }}>
          {mode === 'entrar' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'entrar' ? 'criar' : 'entrar') }}>
            {mode === 'entrar' ? 'Criar conta' : 'Entrar'}
          </a>
        </p>
      </div>
    </div>
  )
}
