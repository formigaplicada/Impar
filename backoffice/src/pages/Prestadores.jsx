import { useState, useEffect } from 'react'
import { api } from '../lib/api'

function Modal({ onClose, onSave }) {
  const [nifInput, setNifInput] = useState('')
  const [loadingNif, setLoadingNif] = useState(false)
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false)
  const [form, setForm] = useState({
    nif: '', nome: '', natureza: '', capital: '', estado: 'active',
    data_inicio: '', cae: '', actividade: '', morada: '', cidade: '',
    codigo_postal: '', regiao: '', concelho: '', freguesia: '',
    email: '', telefone: '', website: ''
  })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [nifErro, setNifErro] = useState('')

  async function pesquisarNif() {
    if (!nifInput || nifInput.length < 9) { setNifErro('NIF inválido.'); return }
    setLoadingNif(true); setNifErro('')
    const res = await api.get(`/nif/${nifInput}`)
    if (res?.ok) {
      setForm({ ...res.dados, nif: nifInput, estado: res.dados.estado || 'active', data_inicio: res.dados.data_inicio || '' })
      setMostrarDetalhes(false)
    } else {
      setNifErro(res?.error || 'NIF não encontrado.')
    }
    setLoadingNif(false)
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome) { setErro('Nome é obrigatório.'); return }
    setLoading(true); setErro('')
    const res = await api.post('/prestadores', form)
    if (res?.ok) { onSave() }
    else { setErro(res?.error || 'Erro ao criar prestador.'); setLoading(false) }
  }

  const input = (label, name, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>{label}</label>
      <input type={type} name={name} value={form[name] || ''} onChange={handleChange}
        style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
      />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '36rem', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Novo Prestador</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Pesquisa por NIF */}
            <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>Pesquisar por NIF</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={nifInput}
                  onChange={e => setNifInput(e.target.value)}
                  placeholder="NIF (9 dígitos)"
                  maxLength={9}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
                />
                <button type="button" onClick={pesquisarNif} disabled={loadingNif} style={{
                  background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem',
                  padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  opacity: loadingNif ? 0.6 : 1, whiteSpace: 'nowrap'
                }}>
                  {loadingNif ? 'A pesquisar...' : '🔍 Pesquisar'}
                </button>
              </div>
              {nifErro && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>❌ {nifErro}</p>}
              {form.nome && <p style={{ color: '#16a34a', fontSize: '0.8rem', marginTop: '0.5rem' }}>✓ Dados preenchidos — revê antes de guardar</p>}
            </div>

            {/* Campos principais */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>Nome *</label>
                <input name="nome" value={form.nome || ''} onChange={handleChange} required
                  style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${!form.nome ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>NIF</label>
                <input name="nif" value={form.nif || ''} onChange={handleChange}
                  style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
              {input('Email', 'email', 'email')}
              {input('Telefone', 'telefone', 'tel')}
            </div>

            {/* Área expansível */}
            <button
              type="button"
              onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
              style={{
                background: 'none', border: '1.5px dashed #e2e8f0', borderRadius: '0.5rem',
                padding: '0.625rem', fontSize: '0.8rem', color: '#64748b',
                cursor: 'pointer', textAlign: 'center', fontFamily: 'DM Sans, sans-serif'
              }}
            >
              {mostrarDetalhes ? '▲ Ocultar dados adicionais' : '▼ Ver dados adicionais'}
            </button>

            {mostrarDetalhes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Identificação */}
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>Identificação</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {input('Natureza', 'natureza')}
                    {input('Capital', 'capital')}
                    {input('Data Início', 'data_inicio', 'date')}
                    {input('CAE', 'cae')}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>Actividade</label>
                      <textarea name="actividade" value={form.actividade || ''} onChange={handleChange} rows={2}
                        style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Localização */}
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>Localização</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>{input('Morada', 'morada')}</div>
                    {input('Cidade', 'cidade')}
                    {input('Código Postal', 'codigo_postal')}
                    {input('Região', 'regiao')}
                    {input('Concelho', 'concelho')}
                    {input('Freguesia', 'freguesia')}
                  </div>
                </div>

                {/* Outros contactos */}
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>Outros contactos</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                    {input('Website', 'website')}
                  </div>
                </div>
              </div>
            )}

            {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>}
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'A criar...' : 'Criar Prestador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Prestadores() {
  const [prestadores, setPrestadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [filtros, setFiltros] = useState({ nome: '', nif: '' })

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.nome) params.set('nome', f.nome)
    if (f.nif)  params.set('nif', f.nif)
    const data = await api.get(`/prestadores?${params}`)
    setPrestadores(data?.prestadores || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function handleFiltro(e) { setFiltros({ ...filtros, [e.target.name]: e.target.value }) }

  return (
    <div>
      {/* Filtros + botão */}
      <form onSubmit={e => { e.preventDefault(); carregar(filtros) }} style={{
        background: 'white', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Nome</label>
          <input name="nome" value={filtros.nome} onChange={handleFiltro} placeholder="Pesquisar nome..."
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '220px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>NIF</label>
          <input name="nif" value={filtros.nif} onChange={handleFiltro} placeholder="NIF"
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '140px' }}
          />
        </div>
        <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Filtrar</button>
        <button type="button" onClick={() => { setFiltros({ nome: '', nif: '' }); carregar({}) }} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Limpar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalAberto(true)} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>+ Novo Prestador</button>
      </form>

      {/* Tabela */}
      <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
        ) : prestadores.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Nenhum prestador encontrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['NIF', 'Nome', 'Natureza', 'Cidade', 'Email', 'Telefone'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prestadores.map(p => (
                <tr key={p.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.nif || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#0f172a' }}>{p.nome}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{p.natureza || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{p.cidade || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#2563eb' }}>{p.email || '—'}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{p.telefone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        {prestadores.length} prestador{prestadores.length !== 1 ? 'es' : ''}
      </p>

      {modalAberto && (
        <Modal
          onClose={() => setModalAberto(false)}
          onSave={() => { setModalAberto(false); carregar() }}
        />
      )}
    </div>
  )
}