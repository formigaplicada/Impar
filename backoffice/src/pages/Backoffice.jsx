import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/auth'
import Ocorrencias from './Ocorrencias'
import Limpezas from './Limpezas'

export default function Backoffice({ page }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenFromUrl = params.get('token')
    if (tokenFromUrl) {
      localStorage.setItem('session_token', tokenFromUrl)
      window.history.replaceState({}, '', '/backoffice')
    }
    auth.me().then(data => {
      if (data?.user) setUser(data.user)
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <p style={{ color: '#64748b' }}>A carregar...</p>
    </div>
  )

  const menuItems = [
    { key: '',            label: '📊 Dashboard',   path: '/backoffice' },
    { key: 'ocorrencias', label: '⚠️ Ocorrências', path: '/backoffice/ocorrencias' },
    { key: 'limpezas',    label: '🧹 Limpezas',    path: '/backoffice/limpezas' },
  ]

  const pageTitle = page === 'ocorrencias' ? 'Ocorrências' : page === 'limpezas' ? 'Limpezas' : 'Dashboard'

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{
        background: '#64748b', padding: '0.875rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <img src="https://www.impar.pt/wp-content/uploads/2025/01/logo-impar-2048x807.png"
          alt="Ímpar" style={{ height: '36px', mixBlendMode: 'screen' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>{user?.nome}</span>
          <button onClick={auth.logout} style={{
            background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none',
            borderRadius: '0.25rem', padding: '0.25rem 0.75rem',
            fontSize: '0.75rem', cursor: 'pointer'
          }}>Sair</button>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
        <nav style={{
          width: '200px', background: 'white', borderRight: '1px solid #e2e8f0',
          padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem'
        }}>
          {menuItems.map(item => (
            <button key={item.key} onClick={() => navigate(item.path)} style={{
              background: page === item.key ? '#eff6ff' : 'transparent',
              color: page === item.key ? '#2563eb' : '#475569',
              border: 'none', textAlign: 'left',
              padding: '0.625rem 1.5rem', fontSize: '0.875rem',
              fontWeight: page === item.key ? 600 : 400,
              cursor: 'pointer', width: '100%'
            }}>
              {item.label}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, padding: '2rem', overflow: 'auto' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem' }}>
            {pageTitle}
          </h1>
          {page === 'ocorrencias' ? (
            <Ocorrencias />
          ) : page === 'limpezas' ? (
            <Limpezas />
          ) : (
            <div style={{
              background: 'white', borderRadius: '1rem', padding: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#64748b'
            }}>
              <p>🚧 Dashboard em construção</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Olá, {user?.nome}!</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}