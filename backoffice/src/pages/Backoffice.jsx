import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/auth'
import { api } from '../lib/api'
import Dashboard from './Dashboard'
import Ocorrencias from './Ocorrencias'
import Limpezas from './Limpezas'
import Condominios from './Condominios'
import Prestadores from './Prestadores'
import OcorrenciaDetalhe from './OcorrenciaDetalhe'

export default function Backoffice({ page }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [modalImpersonate, setModalImpersonate] = useState(false)
  const [utilizadores, setUtilizadores] = useState([])

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

useEffect(() => {
  if (modalImpersonate && utilizadores.length === 0) {
    api.get('/utilizadores').then(d => setUtilizadores(d?.utilizadores || []))
  }
}, [modalImpersonate])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <p style={{ color: '#64748b' }}>A carregar...</p>
    </div>
  )

  const menuItems = [
    { key: '',             label: '📊 Dashboard',    path: '/backoffice' },
    { key: 'condominios',  label: '🏢 Condomínios',  path: '/backoffice/condominios' },
    { key: 'ocorrencias',  label: '⚠️ Ocorrências',  path: '/backoffice/ocorrencias' },
    { key: 'limpezas',     label: '🧹 Limpezas',     path: '/backoffice/limpezas' },
    { key: 'prestadores', label: '🔧 Prestadores', path: '/backoffice/prestadores' },
    ]

  const pageTitle = {
    '':            'Dashboard',
    'condominios': 'Condomínios',
    'ocorrencias': 'Ocorrências',
    'limpezas':    'Limpezas',
    'prestadores': 'Prestadores',
    'ocorrencia_detalhe': 'Ocorrência',
  }[page] || 'Dashboard'

{modalImpersonate && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
    <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '28rem', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Entrar como...</h2>
        <button onClick={() => setModalImpersonate(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
      </div>
      <div style={{ padding: '0.5rem 0' }}>
        {utilizadores.map(u => (
          <button key={u.id} onClick={async () => { setModalImpersonate(false); await auth.startImpersonate(u.id) }} style={{
            width: '100%', background: 'none', border: 'none', padding: '0.875rem 1.5rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid #f1f5f9',
            textAlign: 'left'
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{u.nome}</p>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{u.loja_nome || '—'}</p>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{u.role}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
)}

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{
  background: '#64748b', padding: '0.875rem 1.5rem',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
}}>
  <img src="https://www.impar.pt/wp-content/uploads/2025/01/logo-impar-2048x807.png"
    alt="Ímpar" style={{ height: '36px', mixBlendMode: 'screen' }} />
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
    {/* Banner de impersonate */}
    {user?.impersonator_nome && (
      <div style={{
        background: '#fef3c7', color: '#92400e', borderRadius: '0.375rem',
        padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600
      }}>
        ⚠️ A agir como: {user.nome}
      </div>
    )}
    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
      {user?.nome}
      {user?.impersonator_nome && (
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
          {' '}({user.impersonator_nome})
        </span>
      )}
    </span>

    {/* Botão impersonate — só para admins */}
    {user?.role === 'admin' && !user?.impersonator_nome && (
      <button onClick={() => setModalImpersonate(true)} style={{
        background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
        borderRadius: '0.25rem', padding: '0.25rem 0.5rem',
        fontSize: '0.75rem', cursor: 'pointer', title: 'Impersonate'
      }}>👤</button>
    )}

    {/* Terminar impersonate */}
    {user?.impersonator_nome && (
      <button onClick={auth.stopImpersonate} style={{
        background: '#fef3c7', color: '#92400e', border: 'none',
        borderRadius: '0.25rem', padding: '0.25rem 0.75rem',
        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
      }}>✕ Terminar</button>
    )}

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
          {page === 'condominios'  ? <Condominios /> :
           page === 'ocorrencias'  ? <Ocorrencias /> :
           page === 'ocorrencia_detalhe'? <OcorrenciaDetalhe /> :
           page === 'limpezas'     ? <Limpezas /> :
           page === 'prestadores'  ? <Prestadores /> :
          <Dashboard />}
        </main>
      </div>
    </div>
  )
}