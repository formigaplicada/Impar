import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_LABELS = {
  aberta:    { label: 'Aberta',    color: '#dc2626', bg: '#fee2e2' },
  em_curso:  { label: 'Em curso',  color: '#d97706', bg: '#fef3c7' },
  resolvida: { label: 'Resolvida', color: '#16a34a', bg: '#dcfce7' },
  cancelada: { label: 'Cancelada', color: '#64748b', bg: '#f1f5f9' },
}

const STATUS_TRANSICOES = {
  aberta:    ['em_curso', 'cancelada'],
  em_curso:  ['resolvida', 'cancelada'],
  resolvida: [],
  cancelada: [],
}

function Badge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.aberta
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '0.2rem 0.6rem', borderRadius: '9999px',
      fontSize: '0.75rem', fontWeight: 600
    }}>{s.label}</span>
  )
}

function ModalNovoPrestador({ onClose, onSave }) {
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
    } else {
      setNifErro(res?.error || 'NIF não encontrado.')
    }
    setLoadingNif(false)
  }

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome) { setErro('Nome é obrigatório.'); return }
    setLoading(true); setErro('')
    const res = await api.post('/prestadores', form)
    if (res?.ok) { onSave({ id: res.id, ...form }) }
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '36rem', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Novo Prestador</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Pesquisa NIF */}
            <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '0.75rem' }}>Pesquisar por NIF</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={nifInput} onChange={e => setNifInput(e.target.value)} placeholder="NIF (9 dígitos)" maxLength={9}
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
            <button type="button" onClick={() => setMostrarDetalhes(!mostrarDetalhes)} style={{
              background: 'none', border: '1.5px dashed #e2e8f0', borderRadius: '0.5rem',
              padding: '0.625rem', fontSize: '0.8rem', color: '#64748b',
              cursor: 'pointer', textAlign: 'center', fontFamily: 'DM Sans, sans-serif'
            }}>
              {mostrarDetalhes ? '▲ Ocultar dados adicionais' : '▼ Ver dados adicionais'}
            </button>

            {mostrarDetalhes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  <div style={{ gridColumn: '1 / -1' }}>{input('Morada', 'morada')}</div>
                  {input('Cidade', 'cidade')}
                  {input('Código Postal', 'codigo_postal')}
                  {input('Região', 'regiao')}
                  {input('Concelho', 'concelho')}
                  {input('Freguesia', 'freguesia')}
                  <div style={{ gridColumn: '1 / -1' }}>{input('Website', 'website')}</div>
                </div>
              </div>
            )}

            {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>}
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'A criar...' : 'Criar e Atribuir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalPesquisaPrestador({ onSelect, onClose, onNovo }) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResultados([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const data = await api.get(`/prestadores?nome=${encodeURIComponent(query)}`)
      setResultados(data?.prestadores || [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '32rem', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Pesquisar Prestador</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Pesquisa */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Nome ou NIF..."
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
          />
          {loading && <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>A pesquisar...</p>}
        </div>

        {/* Resultados */}
        <div style={{ padding: '0.5rem 0' }}>
          {resultados.length === 0 && query.length >= 2 && !loading && (
            <p style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#94a3b8' }}>Nenhum resultado encontrado.</p>
          )}
          {resultados.map(p => (
            <button key={p.id} onClick={() => onSelect(p)} style={{
              width: '100%', background: 'none', border: 'none', padding: '0.75rem 1.5rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left',
              borderBottom: '1px solid #f1f5f9'
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{p.nome}</p>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.nif || ''} {p.cidade ? `· ${p.cidade}` : ''}</p>
              </div>
              {p.email && <p style={{ fontSize: '0.75rem', color: '#2563eb' }}>{p.email}</p>}
            </button>
          ))}
        </div>

        {/* Criar novo */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onNovo} style={{
            width: '100%', background: '#f0fdf4', color: '#16a34a',
            border: '1.5px dashed #16a34a', borderRadius: '0.5rem',
            padding: '0.625rem', fontSize: '0.875rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
          }}>
            + Criar novo prestador
          </button>
        </div>
      </div>
    </div>
  )
}

function PainelDetalhe({ ocorrenciaId, onClose, onStatusChange }) {
  const [sugestoes, setSugestoes] = useState([])
  const [modalPrestadorAberto, setModalPrestadorAberto] = useState(false)
  const [detalhe, setDetalhe] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState('')
  const [alterando, setAlterando] = useState(false)

  // Atribuição de prestador
  const [prestadores, setPrestadores] = useState([])
  const [prestadorId, setPrestadorId] = useState('')
  const [contactos, setContactos] = useState([])
  const [contactoId, setContactoId] = useState('')
  const [notasAtribuicao, setNotasAtribuicao] = useState('')
  const [atribuindo, setAtribuindo] = useState(false)
  const [atribuicaoErro, setAtribuicaoErro] = useState('')
  const [atribuicaoSucesso, setAtribuicaoSucesso] = useState('')

  async function carregar() {
    setLoading(true)
    const data = await api.get(`/ocorrencias/${ocorrenciaId}`)
    const sugestoesData = await api.get(`/ocorrencias/${ocorrenciaId}/prestadores-sugeridos`)
    setSugestoes(sugestoesData?.sugestoes || [])
    setDetalhe(data?.ocorrencia || null)
    setHistorico(data?.historico || [])
    setLoading(false)
  }

  async function carregarPrestadores() {
    const data = await api.get('/prestadores')
    setPrestadores(data?.prestadores || [])
  }

  async function carregarContactos(pid) {
    if (!pid) { setContactos([]); return }
    const data = await api.get(`/prestadores/${pid}/contactos`)
    setContactos(data?.contactos || [])
    setContactoId('')
  }

  useEffect(() => {
    carregar()
    carregarPrestadores()
  }, [ocorrenciaId])

  async function mudarStatus(novoStatus) {
    setAlterando(true)
    await api.put(`/ocorrencias/${ocorrenciaId}/status`, { status: novoStatus, notas })
    setNotas('')
    await carregar()
    onStatusChange()
    setAlterando(false)
  }

  async function atribuirPrestador() {
    if (!prestadorId) { setAtribuicaoErro('Selecciona um prestador.'); return }
    setAtribuindo(true); setAtribuicaoErro(''); setAtribuicaoSucesso('')
    const res = await api.post(`/ocorrencias/${ocorrenciaId}/prestador`, {
      prestador_id: parseInt(prestadorId),
      contacto_id: contactoId ? parseInt(contactoId) : null,
      notas: notasAtribuicao || null
    })
    if (res?.ok) {
      setAtribuicaoSucesso('Prestador atribuído com sucesso!')
      setPrestadorId(''); setContactoId(''); setNotasAtribuicao('')
      await carregar(); onStatusChange()
    } else {
      setAtribuicaoErro(res?.error || 'Erro ao atribuir prestador.')
    }
    setAtribuindo(false)
  }

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
  )
  if (!detalhe) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Ocorrência não encontrada.</div>
  )

  const transicoes = STATUS_TRANSICOES[detalhe.status] || []
  const podeAtribuir = detalhe.status === 'aberta' || detalhe.status === 'em_curso'
  const [modalNovoPrestador, setModalNovoPrestador] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>{detalhe.id}</p>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{detalhe.condominio_nome}</h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>N Impar: {detalhe.n_impar}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
      </div>

      {/* Estado actual */}
      <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Estado actual:</span>
          <Badge status={detalhe.status} />
        </div>
        {transicoes.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>Nota (opcional)</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Adicionar nota sobre esta alteração..." rows={2}
                style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {transicoes.map(s => {
                const info = STATUS_LABELS[s]
                return (
                  <button key={s} onClick={() => mudarStatus(s)} disabled={alterando} style={{
                    background: info.bg, color: info.color, border: `1.5px solid ${info.color}`,
                    borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
                    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', opacity: alterando ? 0.6 : 1
                  }}>
                    {alterando ? '...' : `→ ${info.label}`}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Atribuição de prestador */}
      {podeAtribuir && (
  <div style={{ background: '#f0fdf4', borderRadius: '0.75rem', padding: '1rem', border: '1px solid #bbf7d0' }}>
    <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#16a34a', marginBottom: '0.75rem' }}>
      Atribuir Prestador
    </p>

    {/* Sugestões */}
    {sugestoes.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {sugestoes.map(s => (
          <button key={s.id} type="button"
            onClick={() => { setPrestadorId(String(s.id)); carregarContactos(String(s.id)) }}
            style={{
              background: prestadorId === String(s.id) ? '#dcfce7' : 'white',
              border: `1.5px solid ${prestadorId === String(s.id) ? '#16a34a' : '#e2e8f0'}`,
              borderRadius: '0.5rem', padding: '0.625rem 0.875rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: '0.875rem'
            }}>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontWeight: 600, color: '#0f172a' }}>{s.nome}</p>
              {s.email && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.email}</p>}
            </div>
            <span style={{ fontSize: '0.7rem', color: s.origem === 'condominio' ? '#16a34a' : '#64748b', fontWeight: 600 }}>
              {s.origem === 'condominio' ? '★ Último usado' : 'Loja'}
            </span>
          </button>
        ))}
      </div>
    )}

    {/* Pesquisar outro */}
    <button type="button" onClick={() => setModalPrestadorAberto(true)} style={{
      background: 'white', border: '1.5px dashed #cbd5e1', borderRadius: '0.5rem',
      padding: '0.5rem', width: '100%', fontSize: '0.8rem', color: '#64748b',
      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginBottom: '0.75rem'
    }}>
      🔍 Pesquisar outro prestador
    </button>

    {/* Contacto */}
    {contactos.length > 0 && (
      <select value={contactoId} onChange={e => setContactoId(e.target.value)}
        style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', background: 'white', width: '100%', marginBottom: '0.5rem' }}>
        <option value="">Contacto principal</option>
        {contactos.map(c => <option key={c.id} value={c.id}>{c.nome} {c.email ? `(${c.email})` : ''}</option>)}
      </select>
    )}

    <textarea value={notasAtribuicao} onChange={e => setNotasAtribuicao(e.target.value)}
      placeholder="Notas para o prestador (opcional)..." rows={2}
      style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical', width: '100%', marginBottom: '0.5rem' }}
    />

    {atribuicaoErro && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.5rem' }}>❌ {atribuicaoErro}</p>}
    {atribuicaoSucesso && <p style={{ color: '#16a34a', fontSize: '0.8rem', marginBottom: '0.5rem' }}>✓ {atribuicaoSucesso}</p>}

    <button onClick={atribuirPrestador} disabled={atribuindo || !prestadorId} style={{
      background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem',
      padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
      opacity: atribuindo || !prestadorId ? 0.6 : 1, width: '100%'
    }}>
      {atribuindo ? 'A atribuir...' : '✓ Atribuir Prestador'}
    </button>
  </div>
)}

      {/* Detalhes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Categoria</p>
          <p>{detalhe.categoria_emoji} {detalhe.categoria_nome || detalhe.categoria_texto || '—'}</p>
        </div>
        {detalhe.descricao_final && (
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Descrição</p>
            <p style={{ color: '#334155' }}>{detalhe.descricao_final}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Reportado por</p>
          <p>{detalhe.nome_reportante || '—'}</p>
          {detalhe.telefone_reportante && <p>{detalhe.telefone_reportante}</p>}
          {detalhe.email_reportante && <p style={{ color: '#2563eb' }}>{detalhe.email_reportante}</p>}
        </div>
        {detalhe.maps_link && (
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Localização</p>
            <a href={detalhe.maps_link} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>📍 Ver no mapa</a>
          </div>
        )}
        {detalhe.foto_url && (
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Foto</p>
            <img src={detalhe.foto_url} alt="Foto" style={{ maxWidth: '100%', borderRadius: '0.5rem' }} />
          </div>
        )}
      </div>

      {/* Histórico */}
      <div>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.75rem' }}>Histórico</p>
        {historico.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Sem alterações registadas.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {historico.map(h => (
              <div key={h.id} style={{ background: '#f8fafc', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <Badge status={h.estado_anterior || 'aberta'} />
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <Badge status={h.estado_novo} />
                </div>
                {h.notas && <p style={{ color: '#475569', marginTop: '0.25rem' }}>{h.notas}</p>}
                <p style={{ color: '#94a3b8', marginTop: '0.25rem', fontSize: '0.75rem' }}>
                  {h.utilizador_nome} · {new Date(h.criado_em).toLocaleString('pt-PT')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {modalPrestadorAberto && (
        <ModalPesquisaPrestador
          onClose={() => setModalPrestadorAberto(false)}
          onSelect={p => {
            setPrestadorId(String(p.id))
            carregarContactos(String(p.id))
            setModalPrestadorAberto(false)
          }}
          onNovo={() => {
            setModalPrestadorAberto(false)
            setModalNovoPrestador(true)
          }}
        />
      )}

      {modalNovoPrestador && (
        <ModalNovoPrestador
          onClose={() => setModalNovoPrestador(false)}
          onSave={async (novoPrestador) => {
            setModalNovoPrestador(false)
            setPrestadorId(String(novoPrestador.id))
            await carregarContactos(String(novoPrestador.id))
          }}
        />
      )}
    </div>
  )
}

export default function Ocorrencias() {
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [ocorrenciaAberta, setOcorrenciaAberta] = useState(null)
  const [filtros, setFiltros] = useState({
    n_impar: '', categoria: '', status: '', data_inicio: '', data_fim: ''
  })

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.n_impar)     params.set('n_impar', f.n_impar)
    if (f.categoria)   params.set('categoria', f.categoria)
    if (f.status)      params.set('status', f.status)
    if (f.data_inicio) params.set('data_inicio', f.data_inicio)
    if (f.data_fim)    params.set('data_fim', f.data_fim)
    const data = await api.get(`/ocorrencias?${params}`)
    setOcorrencias(data?.ocorrencias || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function handleFiltro(e) {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  function handleFiltroSubmit(e) {
    e.preventDefault()
    carregar(filtros)
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      {/* Lista */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filtros */}
        <form onSubmit={handleFiltroSubmit} style={{
          background: 'white', borderRadius: '0.75rem',
          padding: '1.25rem', marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>N Impar</label>
            <input name="n_impar" value={filtros.n_impar} onChange={handleFiltro}
              placeholder="ex: 351"
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '120px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Categoria</label>
            <input name="categoria" value={filtros.categoria} onChange={handleFiltro}
              placeholder="ex: Iluminação"
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '160px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Estado</label>
            <select name="status" value={filtros.status} onChange={handleFiltro}
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '140px' }}
            >
              <option value="">Todos</option>
              <option value="aberta">Aberta</option>
              <option value="em_curso">Em curso</option>
              <option value="resolvida">Resolvida</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>De</label>
            <input type="date" name="data_inicio" value={filtros.data_inicio} onChange={handleFiltro}
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Até</label>
            <input type="date" name="data_fim" value={filtros.data_fim} onChange={handleFiltro}
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
            />
          </div>
          <button type="submit" style={{
            background: '#2563eb', color: 'white', border: 'none',
            borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
          }}>Filtrar</button>
          <button type="button" onClick={() => { setFiltros({ n_impar: '', categoria: '', status: '', data_inicio: '', data_fim: '' }); carregar({}) }} style={{
            background: '#f1f5f9', color: '#475569', border: 'none',
            borderRadius: '0.5rem', padding: '0.5rem 1rem',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
          }}>Limpar</button>
        </form>

        {/* Tabela */}
        <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
          ) : ocorrencias.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Nenhuma ocorrência encontrada.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['ID', 'N Impar', 'Categoria', 'Reportado por', 'Data', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ocorrencias.map(oc => (
                  <tr key={oc.id}
                    onClick={() => setOcorrenciaAberta(oc.id)}
                    style={{
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                      background: ocorrenciaAberta === oc.id ? '#eff6ff' : 'white'
                    }}
                    onMouseEnter={e => { if (ocorrenciaAberta !== oc.id) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (ocorrenciaAberta !== oc.id) e.currentTarget.style.background = 'white' }}
                  >
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>{oc.id}</td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{oc.n_impar}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>{oc.categoria_emoji} {oc.categoria_nome || oc.categoria_texto || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>{oc.nome_reportante || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{new Date(oc.criado_em).toLocaleDateString('pt-PT')}</td>
                    <td style={{ padding: '0.875rem 1rem' }}><Badge status={oc.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
          {ocorrencias.length} ocorrência{ocorrencias.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Painel lateral */}
      {ocorrenciaAberta && (
        <div style={{
          width: '380px', flexShrink: 0,
          background: 'white', borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          maxHeight: 'calc(100vh - 8rem)', overflow: 'auto',
          position: 'sticky', top: '1rem'
        }}>
          <PainelDetalhe
            ocorrenciaId={ocorrenciaAberta}
            onClose={() => setOcorrenciaAberta(null)}
            onStatusChange={() => carregar()}
          />
        </div>
      )}
    </div>
  )
}