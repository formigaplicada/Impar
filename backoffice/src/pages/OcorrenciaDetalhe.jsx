import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
    <span style={{ background: s.bg, color: s.color, padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

function ModalPrestador({ ocorrenciaId, onClose, onAtribuido }) {
  const [query, setQuery] = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [resultados, setResultados] = useState([])
  const [loading, setLoading] = useState(false)
  const [prestadorSel, setPrestadorSel] = useState(null)
  const [contactos, setContactos] = useState([])
  const [contactoId, setContactoId] = useState('')
  const [notas, setNotas] = useState('')
  const [atribuindo, setAtribuindo] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrarNovo, setMostrarNovo] = useState(false)

  useEffect(() => {
    api.get(`/ocorrencias/${ocorrenciaId}/prestadores-sugeridos`)
      .then(d => setSugestoes(d?.sugestoes || []))
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResultados([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const d = await api.get(`/prestadores?nome=${encodeURIComponent(query)}`)
      setResultados(d?.prestadores || [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function seleccionar(p) {
    setPrestadorSel(p)
    const d = await api.get(`/prestadores/${p.id}/contactos`)
    setContactos(d?.contactos || [])
    setContactoId('')
    setQuery('')
    setResultados([])
  }

  async function atribuir() {
    if (!prestadorSel) return
    setAtribuindo(true); setErro('')
    const res = await api.post(`/ocorrencias/${ocorrenciaId}/prestador`, {
      prestador_id: prestadorSel.id,
      contacto_id: contactoId ? parseInt(contactoId) : null,
      notas: notas || null
    })
    if (res?.ok) { onAtribuido() }
    else { setErro(res?.error || 'Erro ao atribuir.'); setAtribuindo(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1rem', width: '100%', maxWidth: '32rem', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Atribuir Prestador</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Prestador seleccionado */}
          {prestadorSel && (
            <div style={{ background: '#eff6ff', border: '1.5px solid #2563eb', borderRadius: '0.75rem', padding: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 700, color: '#0f172a' }}>{prestadorSel.nome}</p>
                  {prestadorSel.email && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{prestadorSel.email}</p>}
                </div>
                <button onClick={() => { setPrestadorSel(null); setContactos([]); setContactoId('') }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </div>
              {contactos.length > 0 && (
                <select value={contactoId} onChange={e => setContactoId(e.target.value)}
                  style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}>
                  <option value="">Contacto principal</option>
                  {contactos.map(c => <option key={c.id} value={c.id}>{c.nome} {c.email ? `(${c.email})` : ''}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Sugestões */}
          {!prestadorSel && sugestoes.length > 0 && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>Sugestões</p>
              {sugestoes.map(s => (
                <button key={s.id} onClick={() => seleccionar(s)} style={{
                  width: '100%', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem',
                  padding: '0.625rem 0.875rem', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  marginBottom: '0.375rem', textAlign: 'left'
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{s.nome}</p>
                    {s.email && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.email}</p>}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: s.origem === 'condominio' ? '#16a34a' : '#64748b', fontWeight: 600, flexShrink: 0 }}>
                    {s.origem === 'condominio' ? '★ Último' : 'Loja'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Pesquisa */}
          {!prestadorSel && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>Pesquisar</p>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Nome ou NIF..." style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }}
              />
              {loading && <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>A pesquisar...</p>}
              {resultados.map(p => (
                <button key={p.id} onClick={() => seleccionar(p)} style={{
                  width: '100%', background: 'none', border: 'none', padding: '0.625rem 0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid #f1f5f9', textAlign: 'left'
                }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>{p.nome}</p>
                    <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.nif || ''} {p.cidade ? `· ${p.cidade}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Notas */}
          {prestadorSel && (
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Notas para o prestador (opcional)..." rows={2}
              style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical', width: '100%' }}
            />
          )}

          {/* Criar novo */}
          {!prestadorSel && (
            <button onClick={() => setMostrarNovo(true)} style={{
              background: 'none', border: '1.5px dashed #cbd5e1', borderRadius: '0.5rem',
              padding: '0.5rem', width: '100%', fontSize: '0.8rem', color: '#64748b',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
            }}>+ Criar novo prestador</button>
          )}

          {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>❌ {erro}</p>}
        </div>

        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={atribuir} disabled={!prestadorSel || atribuindo} style={{
            background: '#16a34a', color: 'white', border: 'none', borderRadius: '0.5rem',
            padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
            opacity: !prestadorSel || atribuindo ? 0.6 : 1
          }}>
            {atribuindo ? 'A atribuir...' : '✓ Atribuir'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OcorrenciaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [detalhe, setDetalhe] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState('')
  const [alterando, setAlterando] = useState(false)
  const [modalPrestador, setModalPrestador] = useState(false)
  const [prestadorAtribuido, setPrestadorAtribuido] = useState(null)

  async function carregar() {
    setLoading(true)
    const data = await api.get(`/ocorrencias/${id}`)
    setDetalhe(data?.ocorrencia || null)
    setHistorico(data?.historico || [])
    // Verificar se tem prestador atribuído
    const prest = await api.get(`/ocorrencias/${id}/prestadores-sugeridos`)
    const ultimo = prest?.sugestoes?.find(s => s.origem === 'condominio')
    setPrestadorAtribuido(ultimo || null)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [id])

  async function mudarStatus(novoStatus) {
    setAlterando(true)
    await api.put(`/ocorrencias/${id}/status`, { status: novoStatus, notas })
    setNotas('')
    await carregar()
    setAlterando(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', color: '#64748b', fontFamily: 'DM Sans, sans-serif' }}>
      A carregar...
    </div>
  )

  if (!detalhe) return (
    <div style={{ padding: '2rem', color: '#64748b', fontFamily: 'DM Sans, sans-serif' }}>
      Ocorrência não encontrada.
    </div>
  )

  const transicoes = STATUS_TRANSICOES[detalhe.status] || []
  const podeAtribuir = detalhe.status === 'aberta' || detalhe.status === 'em_curso'

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Voltar */}
      <button onClick={() => navigate('/backoffice/ocorrencias')} style={{
        background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
        fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontFamily: 'DM Sans, sans-serif', padding: 0, alignSelf: 'flex-start'
      }}>
        ← Voltar às ocorrências
      </button>

      {/* Informação da ocorrência */}
      <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: '0.25rem' }}>{detalhe.id}</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>{detalhe.condominio_nome}</h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>N Impar: {detalhe.n_impar}</p>
          </div>
          <Badge status={detalhe.status} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', fontSize: '0.875rem' }}>
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Categoria</p>
            <p>{detalhe.categoria_emoji} {detalhe.categoria_nome || detalhe.categoria_texto || '—'}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Data</p>
            <p>{new Date(detalhe.criado_em).toLocaleString('pt-PT')}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Reportado por</p>
            <p style={{ fontWeight: 500 }}>{detalhe.nome_reportante || '—'}</p>
            {detalhe.telefone_reportante && <p style={{ color: '#64748b' }}>{detalhe.telefone_reportante}</p>}
            {detalhe.email_reportante && <p style={{ color: '#2563eb' }}>{detalhe.email_reportante}</p>}
          </div>
          {detalhe.maps_link && (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>Localização</p>
              <a href={detalhe.maps_link} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>📍 Ver no mapa</a>
            </div>
          )}
        </div>

        {detalhe.descricao_final && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', fontSize: '0.875rem', color: '#334155', lineHeight: 1.6 }}>
            {detalhe.descricao_final}
          </div>
        )}

        {detalhe.foto_url && (
          <div style={{ marginTop: '1rem' }}>
            <img src={detalhe.foto_url} alt="Foto" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '0.5rem', objectFit: 'cover' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Acções */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Mudar estado */}
          {transicoes.length > 0 && (
            <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '1rem' }}>Alterar Estado</p>
              <textarea value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Nota opcional..." rows={2}
                style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical', marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {transicoes.map(s => {
                  const info = STATUS_LABELS[s]
                  return (
                    <button key={s} onClick={() => mudarStatus(s)} disabled={alterando} style={{
                      background: info.bg, color: info.color, border: `1.5px solid ${info.color}`,
                      borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem',
                      fontWeight: 600, cursor: 'pointer', opacity: alterando ? 0.6 : 1,
                      fontFamily: 'DM Sans, sans-serif'
                    }}>
                      → {info.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Prestador */}
          {podeAtribuir && (
            <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '1rem' }}>Prestador</p>
              {prestadorAtribuido ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 600, color: '#0f172a' }}>{prestadorAtribuido.nome}</p>
                    {prestadorAtribuido.email && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{prestadorAtribuido.email}</p>}
                  </div>
                  <button onClick={() => setModalPrestador(true)} style={{
                    background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '0.5rem',
                    padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif'
                  }}>Alterar</button>
                </div>
              ) : (
                <button onClick={() => setModalPrestador(true)} style={{
                  width: '100%', background: '#f0fdf4', color: '#16a34a',
                  border: '1.5px dashed #16a34a', borderRadius: '0.5rem',
                  padding: '0.625rem', fontSize: '0.875rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif'
                }}>
                  🔍 Atribuir Prestador
                </button>
              )}
            </div>
          )}
        </div>

        {/* Histórico */}
        <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '1rem' }}>Histórico</p>
          {historico.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Sem alterações registadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
      </div>

      {modalPrestador && (
        <ModalPrestador
          ocorrenciaId={id}
          onClose={() => setModalPrestador(false)}
          onAtribuido={() => { setModalPrestador(false); carregar() }}
        />
      )}
    </div>
  )
}