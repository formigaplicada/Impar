import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_LABELS = {
  aberta:    { label: 'Aberta',    color: '#dc2626', bg: '#fee2e2' },
  em_curso:  { label: 'Em curso',  color: '#d97706', bg: '#fef3c7' },
  resolvida: { label: 'Resolvida', color: '#16a34a', bg: '#dcfce7' },
  cancelada: { label: 'Cancelada', color: '#64748b', bg: '#f1f5f9' },
}

function Badge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.aberta
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '0.2rem 0.6rem', borderRadius: '9999px',
      fontSize: '0.75rem', fontWeight: 600
    }}>
      {s.label}
    </span>
  )
}

export default function Ocorrencias() {
  const [ocorrencias, setOcorrencias] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState(null)
  const [filtros, setFiltros] = useState({
    condominio: '', categoria: '', status: '', data_inicio: '', data_fim: ''
  })

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.condominio)   params.set('condominio', f.condominio)
    if (f.categoria)    params.set('categoria', f.categoria)
    if (f.status)       params.set('status', f.status)
    if (f.data_inicio)  params.set('data_inicio', f.data_inicio)
    if (f.data_fim)     params.set('data_fim', f.data_fim)
    const data = await api.get(`/ocorrencias?${params}`)
    setOcorrencias(data?.ocorrencias || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function handleFiltro(e) {
    const novo = { ...filtros, [e.target.name]: e.target.value }
    setFiltros(novo)
  }

  function handleFiltroSubmit(e) {
    e.preventDefault()
    carregar(filtros)
  }

  return (
    <div>
      {/* Filtros */}
      <form onSubmit={handleFiltroSubmit} style={{
        background: 'white', borderRadius: '0.75rem',
        padding: '1.25rem', marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Condomínio</label>
          <input
            name="condominio" value={filtros.condominio} onChange={handleFiltro}
            placeholder="ID ou nome"
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '160px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Categoria</label>
          <input
            name="categoria" value={filtros.categoria} onChange={handleFiltro}
            placeholder="ex: Iluminação"
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem', width: '160px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Estado</label>
          <select
            name="status" value={filtros.status} onChange={handleFiltro}
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
          <input
            type="date" name="data_inicio" value={filtros.data_inicio} onChange={handleFiltro}
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>Até</label>
          <input
            type="date" name="data_fim" value={filtros.data_fim} onChange={handleFiltro}
            style={{ padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
          />
        </div>
        <button type="submit" style={{
          background: '#2563eb', color: 'white', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>
          Filtrar
        </button>
        <button type="button" onClick={() => { setFiltros({ condominio: '', categoria: '', status: '', data_inicio: '', data_fim: '' }); carregar({}) }} style={{
          background: '#f1f5f9', color: '#475569', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>
          Limpar
        </button>
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
                {['ID', 'Condomínio', 'Categoria', 'Reportado por', 'Data', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map(oc => (
                <>
                  <tr
                    key={oc.id}
                    onClick={() => setExpandido(expandido === oc.id ? null : oc.id)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem' }}>{oc.id}</td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 500 }}>{oc.condominio_nome || oc.condominio_id}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>{oc.categoria_emoji} {oc.categoria_nome || oc.categoria_texto || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>{oc.nome_reportante || '—'}</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>{new Date(oc.criado_em).toLocaleDateString('pt-PT')}</td>
                    <td style={{ padding: '0.875rem 1rem' }}><Badge status={oc.status} /></td>
                    <td style={{ padding: '0.875rem 1rem', color: '#94a3b8' }}>{expandido === oc.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandido === oc.id && (
                    <tr key={oc.id + '-detail'} style={{ background: '#f8fafc' }}>
                      <td colSpan={7} style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
                          <div>
                            <p style={{ color: '#64748b', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Descrição</p>
                            <p style={{ color: '#0f172a' }}>{oc.descricao_final || '—'}</p>
                          </div>
                          <div>
                            <p style={{ color: '#64748b', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Contacto</p>
                            <p>{oc.telefone_reportante || '—'}</p>
                            <p>{oc.email_reportante || '—'}</p>
                          </div>
                          <div>
                            <p style={{ color: '#64748b', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Localização</p>
                            {oc.maps_link
                              ? <a href={oc.maps_link} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Ver no mapa</a>
                              : <p>—</p>
                            }
                          </div>
                          {oc.foto_url && (
                            <div>
                              <p style={{ color: '#64748b', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Foto</p>
                              <img src={oc.foto_url} alt="Foto" style={{ maxHeight: '120px', borderRadius: '0.5rem' }} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        {ocorrencias.length} ocorrência{ocorrencias.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}