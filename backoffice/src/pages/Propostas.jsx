import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const ESTADO_CONFIG = {
  enviada:    { label: 'Enviada',    bg: '#eff6ff', color: '#2563eb' },
  adjudicada: { label: 'Adjudicada', bg: '#f0fdf4', color: '#16a34a' },
  recusada:   { label: 'Recusada',   bg: '#fef2f2', color: '#dc2626' },
  cancelada:  { label: 'Cancelada',  bg: '#f8fafc', color: '#94a3b8' },
}

function Badge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] || { label: estado, bg: '#f1f5f9', color: '#64748b' }
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: '0.375rem', padding: '0.2rem 0.6rem',
      fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      {cfg.label}
    </span>
  )
}

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatEur(val) {
  if (val == null || val === '') return '—'
  return Number(val).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

export default function Propostas() {
  const [propostas, setPropostas] = useState([])
  const [lojas, setLojas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroLoja, setFiltroLoja] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroSearch, setFiltroSearch] = useState('')
  const [detalhe, setDetalhe] = useState(null)

  const [novoEstado, setNovoEstado] = useState('')
  const [notas, setNotas] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/lojas').then(d => setLojas(d?.lojas || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroLoja)   params.set('loja_id', filtroLoja)
    if (filtroEstado) params.set('estado',  filtroEstado)
    if (filtroSearch) params.set('search',  filtroSearch)
    const qs = params.toString()
    api.get('/propostas' + (qs ? '?' + qs : '')).then(d => {
      setPropostas(d?.propostas || [])
      setLoading(false)
    })
  }, [filtroLoja, filtroEstado, filtroSearch])

  function abrirDetalhe(p) {
    setDetalhe(p)
    setNovoEstado('')
    setNotas('')
    setErro('')
  }

  async function confirmarEstado() {
    if (!novoEstado) return
    setSalvando(true)
    setErro('')
    try {
      const res = await api.put(`/propostas/${detalhe.id}/estado`, { estado: novoEstado, notas: notas || null })
      if (res?.ok) {
        const atualizado = { ...detalhe, estado: novoEstado }
        setDetalhe(atualizado)
        setPropostas(prev => prev.map(p => p.id === detalhe.id ? atualizado : p))
        setNovoEstado('')
        setNotas('')
      } else {
        setErro(res?.error || 'Erro ao actualizar estado.')
      }
    } catch {
      setErro('Erro ao actualizar estado.')
    } finally {
      setSalvando(false)
    }
  }

  // ── Painel de detalhe ────────────────────────────────────────────────────

  if (detalhe) return (
    <div>
      <button onClick={() => setDetalhe(null)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#2563eb', fontSize: '0.875rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', gap: '0.35rem', padding: 0
      }}>
        ← Voltar às propostas
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        <div style={card}>
          <SectionTitle>Identificação</SectionTitle>
          <Row label="Código"        value={detalhe.codigo} />
          <Row label="Estado"        value={<Badge estado={detalhe.estado} />} />
          <Row label="Loja"          value={detalhe.loja_nome || '—'} />
          <Row label="Data proposta" value={formatDate(detalhe.data_proposta)} />
          <Row label="Data envio"    value={formatDate(detalhe.data_envio)} />
        </div>

        <div style={card}>
          <SectionTitle>Lead</SectionTitle>
          <Row label="Nome"        value={detalhe.nome} />
          <Row label="Email"       value={detalhe.email} />
          <Row label="Telefone"    value={detalhe.telefone} />
          <Row label="Morada"      value={[detalhe.morada, detalhe.n_porta].filter(Boolean).join(' ')} />
          <Row label="Localidade"  value={detalhe.localidade} />
          <Row label="Cód. Postal" value={detalhe.codigo_postal} />
        </div>

        <div style={card}>
          <SectionTitle>Condomínio</SectionTitle>
          <Row label="Frações"    value={detalhe.n_fracoes ?? '—'} />
          <Row label="Limpeza"    value={detalhe.limpeza || '—'} />
          <Row label="Jardinagem" value={detalhe.jardinagem || '—'} />
          <Row label="Outros"     value={detalhe.outros_servicos || '—'} />
          {detalhe.comentarios && <Row label="Comentários" value={detalhe.comentarios} />}
        </div>

        <div style={card}>
          <SectionTitle>Preços</SectionTitle>
          <Row label="Gestão"     value={formatEur(detalhe.preco_gestao)} />
          <Row label="Limpeza"    value={formatEur(detalhe.preco_limpeza)} />
          <Row label="Jardinagem" value={formatEur(detalhe.preco_jardinagem)} />
          <Row label="Outros"     value={formatEur(detalhe.preco_outros)} />
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
            <Row label="Total s/IVA" value={<strong>{formatEur(detalhe.total_sem_iva)}</strong>} />
          </div>
        </div>

        <div style={{ ...card, gridColumn: '1 / -1' }}>
          <SectionTitle>Links</SectionTitle>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {detalhe.link_pdf         && <a href={detalhe.link_pdf}         target="_blank" rel="noreferrer" style={linkStyle}>📄 PDF Proposta</a>}
            {detalhe.link_gm          && <a href={detalhe.link_gm}          target="_blank" rel="noreferrer" style={linkStyle}>📍 Google Maps</a>}
            {detalhe.link_street_view && <a href={detalhe.link_street_view} target="_blank" rel="noreferrer" style={linkStyle}>🏙 Street View</a>}
          </div>
        </div>

        {(detalhe.utm_source || detalhe.pagina_origem) && (
          <div style={{ ...card, gridColumn: '1 / -1' }}>
            <SectionTitle>Origem</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <Row label="Source"   value={detalhe.utm_source} />
              <Row label="Medium"   value={detalhe.utm_medium} />
              <Row label="Campaign" value={detalhe.utm_campaign} />
              <Row label="Content"  value={detalhe.utm_content} />
              <Row label="Term"     value={detalhe.utm_term} />
              <Row label="Página"   value={detalhe.pagina_origem} />
            </div>
          </div>
        )}

        {/* Mudar estado — só visível se estado for "enviada" */}
        {detalhe.estado === 'enviada' && (
          <div style={{ ...card, gridColumn: '1 / -1' }}>
            <SectionTitle>Actualizar Estado</SectionTitle>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select
                value={novoEstado}
                onChange={e => setNovoEstado(e.target.value)}
                style={{ ...selectStyle, minWidth: '160px' }}
              >
                <option value="">Seleccionar estado...</option>
                <option value="adjudicada">Adjudicada</option>
                <option value="recusada">Recusada</option>
                <option value="cancelada">Cancelada</option>
              </select>

              <input
                placeholder="Notas (opcional)"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '200px', width: 'auto' }}
              />

              <button
                onClick={confirmarEstado}
                disabled={!novoEstado || salvando}
                style={{
                  background: novoEstado ? '#2563eb' : '#e2e8f0',
                  color: novoEstado ? 'white' : '#94a3b8',
                  border: 'none', borderRadius: '0.375rem',
                  padding: '0.5rem 1.25rem', fontSize: '0.875rem',
                  fontWeight: 600, cursor: novoEstado ? 'pointer' : 'default',
                  fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                  transition: 'background 0.15s'
                }}
              >
                {salvando ? 'A guardar...' : 'Confirmar'}
              </button>
            </div>
            {erro && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem', margin: '0.5rem 0 0' }}>{erro}</p>}
          </div>
        )}

      </div>
    </div>
  )

  // ── Listagem ─────────────────────────────────────────────────────────────

  const totais = {
    count: propostas.length,
    total: propostas.reduce((s, p) => s + (Number(p.total_sem_iva) || 0), 0)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Pesquisar nome, email, código..."
          value={filtroSearch}
          onChange={e => setFiltroSearch(e.target.value)}
          style={inputStyle}
        />
        <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} style={selectStyle}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={selectStyle}>
          <option value="">Todos os estados</option>
          <option value="enviada">Enviada</option>
          <option value="adjudicada">Adjudicada</option>
          <option value="recusada">Recusada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            <strong style={{ color: '#0f172a' }}>{totais.count}</strong> propostas
          </span>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            <strong style={{ color: '#0f172a' }}>{formatEur(totais.total)}</strong> total s/IVA
          </span>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>A carregar...</div>
        ) : propostas.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>Nenhuma proposta encontrada.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Código', 'Data envio', 'Nome', 'Localidade', 'Loja', 'Frações', 'Total s/IVA', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {propostas.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => abrirDetalhe(p)}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafafa'}
                >
                  <td style={td}><code style={{ fontSize: '0.78rem', color: '#2563eb' }}>{p.codigo}</code></td>
                  <td style={td}>{formatDate(p.data_envio)}</td>
                  <td style={td}>{p.nome}</td>
                  <td style={td}>{p.localidade || '—'}</td>
                  <td style={td}>{p.loja_nome || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{p.n_fracoes ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatEur(p.total_sem_iva)}</td>
                  <td style={td}><Badge estado={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontSize: '0.875rem', fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem'
    }}>
      {children}
    </h3>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', gap: '1rem' }}>
      <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: '0.8rem', color: '#0f172a', textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  )
}

const card = {
  background: 'white', borderRadius: '0.75rem',
  border: '1px solid #e2e8f0', padding: '1.5rem'
}

const td = { padding: '0.75rem 1rem', color: '#334155', whiteSpace: 'nowrap' }

const inputStyle = {
  padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
  border: '1px solid #e2e8f0', fontSize: '0.875rem',
  fontFamily: 'DM Sans, sans-serif', width: '260px',
  outline: 'none', color: '#0f172a'
}

const selectStyle = {
  padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
  border: '1px solid #e2e8f0', fontSize: '0.875rem',
  fontFamily: 'DM Sans, sans-serif', background: 'white',
  outline: 'none', color: '#0f172a', cursor: 'pointer'
}

const linkStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  padding: '0.4rem 0.875rem', borderRadius: '0.375rem',
  background: '#eff6ff', color: '#2563eb',
  fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none'
}