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

function PainelDetalhe({ ocorrenciaId, onClose, onStatusChange }) {
  const [detalhe, setDetalhe] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState('')
  const [alterando, setAlterando] = useState(false)

  async function carregar() {
    setLoading(true)
    const data = await api.get(`/ocorrencias/${ocorrenciaId}`)
    setDetalhe(data?.ocorrencia || null)
    setHistorico(data?.historico || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [ocorrenciaId])

  async function mudarStatus(novoStatus) {
    setAlterando(true)
    await api.put(`/ocorrencias/${ocorrenciaId}/status`, { status: novoStatus, notas })
    setNotas('')
    await carregar()
    onStatusChange()
    setAlterando(false)
  }

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
  )

  if (!detalhe) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Ocorrência não encontrada.</div>
  )

  const transicoes = STATUS_TRANSICOES[detalhe.status] || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.25rem' }}>
            {detalhe.id}
          </p>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            {detalhe.condominio_nome}
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>N Impar: {detalhe.n_impar}</p>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', fontSize: '1.25rem',
          cursor: 'pointer', color: '#94a3b8'
        }}>✕</button>
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
              <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#475569' }}>
                Nota (opcional)
              </label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Adicionar nota sobre esta alteração..."
                rows={2}
                style={{
                  padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0',
                  borderRadius: '0.5rem', fontSize: '0.875rem',
                  fontFamily: 'DM Sans, sans-serif', resize: 'vertical'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {transicoes.map(s => {
                const info = STATUS_LABELS[s]
                return (
                  <button
                    key={s}
                    onClick={() => mudarStatus(s)}
                    disabled={alterando}
                    style={{
                      background: info.bg, color: info.color,
                      border: `1.5px solid ${info.color}`,
                      borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                      opacity: alterando ? 0.6 : 1
                    }}
                  >
                    {alterando ? '...' : `→ ${info.label}`}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

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
        <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.75rem' }}>
          Histórico
        </p>
        {historico.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Sem alterações registadas.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {historico.map(h => (
              <div key={h.id} style={{
                background: '#f8fafc', borderRadius: '0.5rem',
                padding: '0.75rem', fontSize: '0.8rem'
              }}>
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