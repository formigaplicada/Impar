import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function BotaoFichaCondominio({ condominioId }) {
  const [url,     setUrl]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [motivo,  setMotivo]  = useState(null)

  useEffect(() => {
    api.get(`/condominios/${condominioId}/ficha-url`).then(res => {
      setUrl(res.url || null)
      setMotivo(res.motivo || null)
      setLoading(false)
    })
  }, [condominioId])

  if (loading) return null

  if (!url) {
    const msgs = {
      sem_pasta_onedrive: 'Sem pasta OneDrive configurada.',
      ficha_nao_existe:   'Ficha ainda não gerada.',
    }
    return (
      <span style={{ fontSize: '0.78rem', color: '#9aa3b0' }}>
        {msgs[motivo] || 'Ficha indisponível.'}
      </span>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        background: '#2D5A27', color: '#ffffff',
        border: 'none', borderRadius: '0.5rem',
        padding: '0.5rem 1.125rem',
        fontSize: '0.82rem', fontWeight: 600,
        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        textDecoration: 'none',
      }}
    >
      📄 Abrir Ficha
    </a>
  )
}