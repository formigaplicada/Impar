import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const STATUS_LABELS = {
  aberta:    { label: 'Aberta',    color: '#dc2626', bg: '#fee2e2' },
  em_curso:  { label: 'Em curso',  color: '#d97706', bg: '#fef3c7' },
  resolvida: { label: 'Resolvida', color: '#16a34a', bg: '#dcfce7' },
  cancelada: { label: 'Cancelada', color: '#64748b', bg: '#f1f5f9' },
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'white', borderRadius: '0.75rem', padding: '1.25rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex',
      flexDirection: 'column', gap: '0.25rem'
    }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>{label}</p>
      <p style={{ fontSize: '2rem', fontWeight: 700, color: color || '#0f172a', lineHeight: 1 }}>{value ?? '—'}</p>
      {sub && <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{sub}</p>}
    </div>
  )
}

function BarraHorizontal({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
      <span style={{ width: '140px', flexShrink: 0, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '9999px', height: '8px' }}>
        <div style={{ width: `${pct}%`, background: color || '#2563eb', borderRadius: '9999px', height: '8px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ width: '32px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{value}</span>
    </div>
  )
}

export default function Dashboard() {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('semana')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  function calcularPeriodo(p) {
    const agora = new Date()
    const fim = agora.toISOString()
    let inicio
    if (p === 'hoje') {
      inicio = new Date(agora.setHours(0, 0, 0, 0)).toISOString()
    } else if (p === 'semana') {
      inicio = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    } else if (p === 'mes') {
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString()
    }
    return { inicio, fim }
  }

  async function carregar(p = periodo, inicio = null, fim = null) {
    setLoading(true)
    const params = new URLSearchParams()
    if (p === 'livre' && inicio && fim) {
      params.set('data_inicio', inicio)
      params.set('data_fim', fim)
    } else {
      const { inicio: i, fim: f } = calcularPeriodo(p)
      params.set('data_inicio', i)
      params.set('data_fim', f)
    }
    const data = await api.get(`/dashboard?${params}`)
    setDados(data)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const totalOcorrencias = dados?.por_estado?.reduce((acc, s) => acc + Number(s.total), 0) || 0
  const maxCategoria = Math.max(...(dados?.por_categoria?.map(c => Number(c.total)) || [1]))
  const maxLoja = Math.max(...(dados?.por_loja?.map(l => Number(l.total)) || [1]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Selector de período */}
      <div style={{
        background: 'white', borderRadius: '0.75rem', padding: '1rem 1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center'
      }}>
        {[
          { key: 'hoje',   label: 'Hoje' },
          { key: 'semana', label: 'Esta semana' },
          { key: 'mes',    label: 'Este mês' },
          { key: 'livre',  label: 'Período livre' },
        ].map(p => (
          <button key={p.key} onClick={() => { setPeriodo(p.key); if (p.key !== 'livre') carregar(p.key) }} style={{
            background: periodo === p.key ? '#2563eb' : '#f1f5f9',
            color: periodo === p.key ? 'white' : '#475569',
            border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
          }}>{p.label}</button>
        ))}
        {periodo === 'livre' && (
          <>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
            />
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '0.875rem' }}
            />
            <button onClick={() => carregar('livre', dataInicio, dataFim)} style={{
              background: '#2563eb', color: 'white', border: 'none',
              borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
              fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer'
            }}>Aplicar</button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>A carregar...</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <KPI label="Total ocorrências" value={totalOcorrencias} />
            <KPI label="Total limpezas" value={dados?.total_limpezas} color="#16a34a" />
            <KPI label="Tempo médio resolução" value={dados?.tempo_medio_horas ? `${dados.tempo_medio_horas}h` : '—'} sub="desde abertura até resolução" />
            {dados?.por_estado?.map(s => (
              <KPI
                key={s.status}
                label={STATUS_LABELS[s.status]?.label || s.status}
                value={Number(s.total)}
                color={STATUS_LABELS[s.status]?.color}
              />
            ))}
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Por categoria */}
            <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
                Ocorrências por categoria
              </p>
              {dados?.por_categoria?.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {dados?.por_categoria?.map(c => (
                    <BarraHorizontal
                      key={c.categoria}
                      label={`${c.emoji} ${c.categoria}`}
                      value={Number(c.total)}
                      max={maxCategoria}
                      color="#d97706"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Por loja */}
            <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
                Ocorrências por loja
              </p>
              {dados?.por_loja?.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {dados?.por_loja?.map(l => (
                    <BarraHorizontal
                      key={l.loja}
                      label={l.loja}
                      value={Number(l.total)}
                      max={maxLoja}
                      color="#2563eb"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}