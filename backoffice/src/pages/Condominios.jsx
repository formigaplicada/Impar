import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const CAMPOS_OBRIGATORIOS = ['loja_id', 'nome']

function Modal({ lojas, onClose, onSave }) {
  const [form, setForm] = useState({
    loja_id: '', nome: '', nipc: '', morada: '', codigo_postal: '',
    telefone: '', telemovel: '', n_fracoes: '', iban: '',
    gestor: '', email_gestor: '', telefone2: ''
  })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
  e.preventDefault()
  if (!form.loja_id || !form.nome) {
    setErro('Loja e Nome são obrigatórios.')
    return
  }
  setLoading(true)
  setErro('')
  const res = await api.post('/condominios', form)
  if (res?.ok) {
    onSave(res.n_impar)
  } else {
    setErro(res?.error || 'Erro ao criar condomínio.')
    setLoading(false)
  }
}

  const input = (label, name, type = 'text', obrigatorio = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>
        {label}{obrigatorio ? ' *' : ''}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        required={obrigatorio}
        style={{
          padding: '0.5rem 0.75rem',
          border: `1.5px solid ${obrigatorio && !form[name] ? '#fca5a5' : '#e2e8f0'}`,
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontFamily: 'DM Sans, sans-serif'
        }}
      />
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: '1rem'
    }}>
      <div style={{
        background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '36rem',
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
            Novo Condomínio
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '1.25rem',
            cursor: 'pointer', color: '#94a3b8', lineHeight: 1
          }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Obrigatórios */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Obrigatórios
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>Loja *</label>
                  <select
                    name="loja_id"
                    value={form.loja_id}
                    onChange={handleChange}
                    required
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: `1.5px solid ${!form.loja_id ? '#fca5a5' : '#e2e8f0'}`,
                      borderRadius: '0.5rem', fontSize: '0.875rem',
                      fontFamily: 'DM Sans, sans-serif', background: 'white'
                    }}
                  >
                    <option value="">Selecionar loja...</option>
                    {lojas.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                </div>
                {input('Nome', 'nome', 'text', true)}
              </div>
            </div>

            {/* Identificação */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Identificação
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {input('NIPC', 'nipc')}
                {input('Nº Frações', 'n_fracoes', 'number')}
                {input('IBAN', 'iban')}
              </div>
            </div>

            {/* Localização */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Localização
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  {input('Morada', 'morada')}
                </div>
                {input('Código Postal', 'codigo_postal')}
              </div>
            </div>

            {/* Contactos */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Contactos
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {input('Telefone', 'telefone', 'tel')}
                {input('Telemóvel', 'telemovel', 'tel')}
                {input('Telefone 2', 'telefone2', 'tel')}
              </div>
            </div>

            {/* Gestor */}
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>
                Gestor
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {input('Nome do Gestor', 'gestor')}
                {input('Email do Gestor', 'email_gestor', 'email')}
              </div>
            </div>

            {erro && (
              <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0',
            display: 'flex', gap: '0.75rem', justifyContent: 'flex-end'
          }}>
            <button type="button" onClick={onClose} style={{
              background: '#f1f5f9', color: '#475569', border: 'none',
              borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
              fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
            }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{
              background: '#2563eb', color: 'white', border: 'none',
              borderRadius: '0.5rem', padding: '0.625rem 1.25rem',
              fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
              opacity: loading ? 0.6 : 1
            }}>
              {loading ? 'A criar...' : 'Criar Condomínio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Condominios() {
  const [condominios, setCondominios] = useState([])
  const [lojas, setLojas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [filtros, setFiltros] = useState({ n_impar: '', nome: '' })

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.n_impar) params.set('n_impar', f.n_impar)
    if (f.nome)    params.set('nome', f.nome)
    const data = await api.get(`/condominios?${params}`)
    setCondominios(data?.condominios || [])
    setLoading(false)
  }

  async function carregarLojas() {
    const data = await api.get('/lojas')
    setLojas(data?.lojas || [])
  }

  useEffect(() => {
    carregar()
    carregarLojas()
  }, [])

  function handleFiltro(e) {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  function handleSubmit(e) {
    e.preventDefault()
    carregar(filtros)
  }

  return (
    <div>
      {/* Filtros + botão novo */}
      <form onSubmit={handleSubmit} style={{
        background: 'white', borderRadius: '0.75rem',
        padding: '1.25rem', marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>N Impar</label>
          <input
            name="n_impar" value={filtros.n_impar} onChange={handleFiltro}
            placeholder="ex: 351"
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '120px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Nome</label>
          <input
            name="nome" value={filtros.nome} onChange={handleFiltro}
            placeholder="Pesquisar nome..."
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '220px' }}
          />
        </div>
        <button type="submit" style={{
          background: '#2563eb', color: 'white', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>Filtrar</button>
        <button type="button" onClick={() => { setFiltros({ n_impar: '', nome: '' }); carregar({}) }} style={{
          background: '#f1f5f9', color: '#475569', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>Limpar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalAberto(true)} style={{
          background: '#16a34a', color: 'white', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>+ Novo Condomínio</button>
      </form>

      {/* Tabela */}
      <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
        ) : condominios.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Nenhum condomínio encontrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['N Impar', 'Nome', 'Loja', 'Gestor', 'Telefone', 'Email'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {condominios.map(c => (
                <tr key={c.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#0f172a' }}>{c.n_impar}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#334155' }}>{c.nome}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{c.loja_nome}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{c.gestor || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{c.telefone || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{c.email_gestor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        {condominios.length} condomínio{condominios.length !== 1 ? 's' : ''}
      </p>

      {modalAberto && (
        <Modal
          lojas={lojas}
          onClose={() => setModalAberto(false)}
         onSave={(n_impar) => {
  	setModalAberto(false)
 	 carregar()
  	alert(`✅ Condomínio criado com sucesso! N Impar: ${n_impar}`)
	}}
        />
      )}
    </div>
  )
}