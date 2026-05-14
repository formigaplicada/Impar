import { useState, useEffect } from 'react'
import { api } from '../lib/api'

export default function Limpezas() {
  const [limpezas, setLimpezas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ n_impar: '', data_inicio: '', data_fim: '' })

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.n_impar)     params.set('n_impar', f.n_impar)
    if (f.data_inicio) params.set('data_inicio', f.data_inicio)
    if (f.data_fim)    params.set('data_fim', f.data_fim)
    const data = await api.get(`/limpezas?${params}`)
    setLimpezas(data?.limpezas || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  function handleFiltro(e) {
    setFiltros({ ...filtros, [e.target.name]: e.target.value })
  }

  function handleSubmit(e) {
    e.preventDefault()
    carregar(filtros)
  }

  return (
    <div>
      {/* Filtros */}
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
          background: '#16a34a', color: 'white', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>Filtrar</button>
        <button type="button" onClick={() => { setFiltros({ n_impar: '', data_inicio: '', data_fim: '' }); carregar({}) }} style={{
          background: '#f1f5f9', color: '#475569', border: 'none',
          borderRadius: '0.5rem', padding: '0.5rem 1rem',
          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
        }}>Limpar</button>
      </form>

      {/* Tabela */}
      <div style={{ background: 'white', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>A carregar...</div>
        ) : limpezas.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Nenhuma limpeza encontrada.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['N Impar', 'Condomínio', 'Data / Hora', 'Precisão', 'Foto', 'Mapa'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limpezas.map(l => (
                <tr key={l.id}
                  style={{ borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#0f172a' }}>{l.n_impar}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>{l.condominio_nome}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>
                    {l.ts_checkin ? new Date(l.ts_checkin).toLocaleString('pt-PT') : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>
                    {l.precisao_m ? `${Math.round(l.precisao_m)}m` : '—'}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {l.tem_foto
                      ? <a href={l.foto_url} target="_blank" rel="noreferrer" style={{ color: '#16a34a', fontWeight: 600 }}>📷 Ver</a>
                      : <span style={{ color: '#94a3b8' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {l.maps_link
                      ? <a href={l.maps_link} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>📍 Mapa</a>
                      : <span style={{ color: '#94a3b8' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
        {limpezas.length} registo{limpezas.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}