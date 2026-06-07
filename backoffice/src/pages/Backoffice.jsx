import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/auth'
import { api } from '../lib/api'
import Dashboard from './Dashboard'
import Ocorrencias from './Ocorrencias'
import Limpezas from './Limpezas'
import Condominios from './Condominios'
import Prestadores from './Prestadores'
import Propostas from './Propostas'
import OcorrenciaDetalhe from './OcorrenciaDetalhe'
import Eventos from './Eventos'
import Lojas from './Lojas'

const MENU = [
  { key: 'dashboard', label: '📊 Dashboard', icon: '📊', path: '/backoffice', page: '' },
  {
    group: 'Comercial', adminOnly: true,
    items: [
      { key: 'propostas', label: '📋 Propostas', icon: '📋', path: '/backoffice/propostas', page: 'propostas' },
    ]
  },
  {
    group: 'Operacional',
    items: [
      { key: 'ocorrencias', label: '⚠️ Ocorrências', icon: '⚠️', path: '/backoffice/ocorrencias', page: 'ocorrencias' },
      { key: 'limpezas',    label: '🧹 Limpezas',    icon: '🧹', path: '/backoffice/limpezas',    page: 'limpezas'    },
      { key: 'eventos',     label: '📅 Agenda',       icon: '📅', path: '/backoffice/eventos',     page: 'eventos'     },
    ]
  },
  {
    group: 'Entidades',
    items: [
      { key: 'condominios', label: '🏢 Condomínios', icon: '🏢', path: '/backoffice/condominios', page: 'condominios' },
      { key: 'prestadores', label: '🔧 Prestadores', icon: '🔧', path: '/backoffice/prestadores', page: 'prestadores' },
      { key: 'lojas',       label: '🏪 Lojas',       icon: '🏪', path: '/backoffice/lojas',       page: 'lojas'       },
    ]
  },
]

const PAGE_TITLE = {
  '': 'Dashboard', 'propostas': 'Propostas', 'condominios': 'Condomínios',
  'ocorrencias': 'Ocorrências', 'ocorrencia_detalhe': 'Ocorrência',
  'limpezas': 'Limpezas', 'prestadores': 'Prestadores',
  'eventos': 'Agenda', 'lojas': 'Lojas',
}

export default function Backoffice({ page }) {
  const [user,             setUser]             = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [sidebarAberta,    setSidebarAberta]    = useState(false)
  const [modalImpersonate, setModalImpersonate] = useState(false)
  const [utilizadores,     setUtilizadores]     = useState([])
  const navigate = useNavigate()

  // Detectar mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

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

  const isAdmin       = user?.role === 'admin'
  const SIDEBAR_FULL  = 200  // px quando expandida
  const SIDEBAR_MINI  = 52   // px quando recolhida (só ícones)

  // Mobile: sidebar é drawer por cima do conteúdo
  // Desktop: sidebar empurra o conteúdo, recolhida por defeito
  const expandida = isMobile ? sidebarAberta : sidebarAberta

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── Header ── */}
      <header style={{
        background: '#64748b', padding: '0.875rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Botão ☰ */}
          <button
            onClick={() => setSidebarAberta(v => !v)}
            style={{
              background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
              borderRadius: '0.375rem', padding: '0.3rem 0.55rem',
              fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1,
            }}
          >☰</button>
          <img
            src="https://www.impar.pt/wp-content/uploads/2025/01/logo-impar-2048x807.png"
            alt="Ímpar" style={{ height: '32px', mixBlendMode: 'screen' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user?.impersonator_nome && (
            <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: '0.375rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600 }}>
              ⚠️ A agir como: {user.nome}
            </div>
          )}
          {!isMobile && (
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
              {user?.nome}
              {user?.impersonator_nome && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}> ({user.impersonator_nome})</span>}
            </span>
          )}
          {isAdmin && !user?.impersonator_nome && (
            <button onClick={() => setModalImpersonate(true)} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}>👤</button>
          )}
          {user?.impersonator_nome && (
            <button onClick={auth.stopImpersonate} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '0.25rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>✕ Terminar</button>
          )}
          <button onClick={auth.logout} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '0.25rem', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}>Sair</button>
        </div>
      </header>

      {/* ── Overlay mobile ── */}
      {isMobile && expandida && (
        <div
          onClick={() => setSidebarAberta(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 150 }}
        />
      )}

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 54px)' }}>

        {/* ── Sidebar ── */}
        <nav style={{
          width:      isMobile ? (expandida ? SIDEBAR_FULL : 0) : (expandida ? SIDEBAR_FULL : SIDEBAR_MINI),
          minWidth:   isMobile ? (expandida ? SIDEBAR_FULL : 0) : (expandida ? SIDEBAR_FULL : SIDEBAR_MINI),
          background: 'white',
          borderRight: '1px solid #e2e8f0',
          display:    'flex',
          flexDirection: 'column',
          overflow:   'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          // Mobile: posição fixa como drawer
          ...(isMobile ? {
            position: 'fixed', top: 54, left: 0, bottom: 0, zIndex: 160,
          } : {}),
        }}>
          <div style={{ padding: '0.75rem 0', overflowY: 'auto', flex: 1 }}>
            {MENU.map((entry, i) => {
              if (!entry.group) {
                return (
                  <NavItem
                    key={entry.key}
                    label={entry.label}
                    icon={entry.icon}
                    active={page === entry.page}
                    expandida={expandida}
                    onClick={() => { navigate(entry.path); if (isMobile) setSidebarAberta(false) }}
                  />
                )
              }

              if (entry.adminOnly && !isAdmin) return null
              const items = (entry.items || []).filter(it => !it.adminOnly || isAdmin)
              if (items.length === 0) return null

              return (
                <div key={entry.group} style={{ marginTop: i === 0 ? 0 : '0.5rem' }}>
                  {/* Label do grupo — só visível quando expandida */}
                  {expandida && (
                    <div style={{
                      padding: '0.5rem 1rem 0.25rem',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.group}
                    </div>
                  )}
                  {!expandida && <div style={{ height: '0.5rem' }} />}
                  {items.map(it => (
                    <NavItem
                      key={it.key}
                      label={it.label}
                      icon={it.icon}
                      active={page === it.page}
                      expandida={expandida}
                      onClick={() => { navigate(it.path); if (isMobile) setSidebarAberta(false) }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </nav>

        {/* ── Main ── */}
        <main style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', overflow: 'auto', minWidth: 0 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem' }}>
            {PAGE_TITLE[page] || 'Dashboard'}
          </h1>
          {page === 'propostas'          ? (isAdmin ? <Propostas /> : null) :
           page === 'condominios'        ? <Condominios /> :
           page === 'ocorrencias'        ? <Ocorrencias /> :
           page === 'ocorrencia_detalhe' ? <OcorrenciaDetalhe /> :
           page === 'limpezas'           ? <Limpezas /> :
           page === 'prestadores'        ? <Prestadores /> :
           page === 'eventos'            ? <Eventos /> :
           page === 'lojas'              ? <Lojas /> :
           <Dashboard />}
        </main>
      </div>

      {/* ── Modal Impersonate ── */}
      {modalImpersonate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '28rem', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Entrar como...</h2>
              <button onClick={() => setModalImpersonate(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ padding: '0.5rem 0' }}>
              {utilizadores.map(u => (
                <button key={u.id} onClick={async () => { setModalImpersonate(false); await auth.startImpersonate(u.id) }}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}
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
    </div>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({ label, icon, active, expandida, onClick }) {
  const [tooltip, setTooltip] = useState(false)

  // Extrair só o texto sem emoji para o tooltip
  const texto = label.replace(/^\S+\s/, '')

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => { if (!expandida) setTooltip(true) }}
        onMouseLeave={() => setTooltip(false)}
        style={{
          background:  active ? '#eff6ff' : 'transparent',
          color:       active ? '#2563eb' : '#475569',
          border:      'none',
          textAlign:   expandida ? 'left' : 'center',
          padding:     expandida ? '0.575rem 1rem' : '0.575rem 0',
          fontSize:    '0.875rem',
          fontWeight:  active ? 600 : 400,
          cursor:      'pointer',
          width:       '100%',
          borderLeft:  active ? '3px solid #2563eb' : '3px solid transparent',
          transition:  'all 0.1s',
          whiteSpace:  'nowrap',
          overflow:    'hidden',
          display:     'flex',
          alignItems:  'center',
          gap:         expandida ? '0.5rem' : 0,
          justifyContent: expandida ? 'flex-start' : 'center',
        }}
        onMouseEnterCapture={e => { if (!active) e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeaveCapture={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
        {expandida && <span>{texto}</span>}
      </button>

      {/* Tooltip */}
      {tooltip && !expandida && (
        <div style={{
          position: 'absolute', left: '110%', top: '50%', transform: 'translateY(-50%)',
          background: '#0f172a', color: 'white',
          padding: '0.3rem 0.65rem', borderRadius: '0.375rem',
          fontSize: '0.78rem', fontWeight: 500, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 300,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {texto}
        </div>
      )}
    </div>
  )
}
