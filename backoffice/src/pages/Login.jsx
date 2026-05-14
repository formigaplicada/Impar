import { auth } from '../lib/auth'

export default function Login() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      fontFamily: 'DM Sans, sans-serif'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2.5rem',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '24rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        <img
          src="https://www.impar.pt/wp-content/uploads/2025/01/logo-impar-2048x807.png"
          alt="Ímpar"
          style={{ height: '40px', objectFit: 'contain', margin: '0 auto' }}
        />
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
            Backoffice Ímpar
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Acesso restrito a colaboradores Ímpar
          </p>
        </div>
        <button
          onClick={auth.login}
          style={{
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
          </svg>
          Entrar com Microsoft
        </button>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          Utiliza a tua conta @impar.pt
        </p>
      </div>
    </div>
  )
}