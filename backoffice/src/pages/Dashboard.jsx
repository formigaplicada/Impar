import { useState, useEffect } from 'react'
import { api } from '../lib/api'

// ── Paleta Ímpar ─────────────────────────────────────────────────────────────
const C = {
  navy:    '#011640',
  lime:    '#C8DA00',
  white:   '#ffffff',
  bg:      '#f4f6f9',
  surface: '#ffffff',
  border:  '#e4e8ef',
  borderL: '#f0f3f7',
  text:    '#0f1d2e',
  muted:   '#6b7a90',
  subtle:  '#9aa3b0',
}

const STATUS_LABELS = {
  aberta:    { label: 'Aberta',    color: '#dc2626', bg: '#fee2e2' },
  em_curso:  { label: 'Em curso',  color: '#d97706', bg: '#fef3c7' },
  resolvida: { label: 'Resolvida', color: '#16a34a', bg: '#dcfce7' },
  cancelada: { label: 'Cancelada', color: '#64748b', bg: '#f1f5f9' },
}

// ── KPI ───────────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, color }) {
  return (
    <div style={{
      background: C.surface, borderRadius: '0.75rem', padding: '1.25rem',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(1,22,64,0.06)',
      display: 'flex', flexDirection: 'column', gap: '0.25rem'
    }}>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, margin: 0 }}>{label}</p>
      <p style={{ fontSize: '2rem', fontWeight: 800, color: color || C.navy, lineHeight: 1, margin: '0.25rem 0 0', fontFamily: 'DM Sans, sans-serif' }}>{value ?? '—'}</p>
      {sub && <p style={{ fontSize: '0.72rem', color: C.muted, margin: '0.25rem 0 0' }}>{sub}</p>}
    </div>
  )
}

// ── Barra Horizontal ──────────────────────────────────────────────────────────

function BarraHorizontal({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.82rem' }}>
      <span style={{ flex: '0 1 auto', minWidth: 0, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: '0 0 80px', background: '#f1f5f9', borderRadius: '9999px', height: '7px' }}>
        <div style={{ width: `${pct}%`, background: color || C.navy, borderRadius: '9999px', height: '7px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ flex: '0 0 auto', fontWeight: 700, color: C.text, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {value}{sub ? <span style={{ fontWeight: 400, color: C.muted, fontSize: '0.75rem', marginLeft: '0.25rem' }}>{sub}</span> : null}
      </span>
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0 0.25rem' }}>
      <span style={{
        fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: C.subtle,
      }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ title, children, empty }) {
  return (
    <div style={{
      background: C.surface, borderRadius: '0.875rem', padding: '1.25rem 1.5rem',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(1,22,64,0.06)'
    }}>
      {title && <p style={{ fontSize: '0.82rem', fontWeight: 700, color: C.text, margin: '0 0 1rem', fontFamily: 'DM Sans, sans-serif' }}>{title}</p>}
      {empty
        ? <p style={{ color: C.subtle, fontSize: '0.82rem', margin: 0 }}>Sem dados para o período.</p>
        : children
      }
    </div>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatEurInt(val) {
  if (val == null || val === '') return '—'
  return Math.round(Number(val)).toLocaleString('pt-PT') + ' €'
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [dados, setDados]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [periodo, setPeriodo]     = useState('semana')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]     = useState('')

  function calcularPeriodo(p) {
    const agora = new Date()
    const fim = new Date().toISOString()
    let inicio
    if (p === 'hoje') {
      const d = new Date(); d.setHours(0,0,0,0)
      inicio = d.toISOString()
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

  // ── Derivados ───────────────────────────────────────────────────────────────

  const totalOcorrencias  = dados?.por_estado?.reduce((acc, s) => acc + Number(s.total), 0) || 0
  const maxCategoria      = Math.max(...(dados?.por_categoria?.map(c => Number(c.total)) || [1]))
  const maxLojaOcorrencia = Math.max(...(dados?.por_loja?.map(l => Number(l.total)) || [1]))
  const maxLojaPropostas  = Math.max(...(dados?.propostas_por_loja?.map(l => Number(l.count)) || [1]))


  const totalPropostas    = dados?.propostas_por_loja?.reduce((s, l) => s + Number(l.count), 0) || 0
  const totalValor        = dados?.propostas_por_loja?.reduce((s, l) => s + Number(l.total_sem_iva), 0) || 0
  const totalCondominios  = dados?.condominios_por_loja?.reduce((s, l) => s + Number(l.total), 0) || 0
  const novosCondominios  = dados?.condominios_por_loja?.reduce((s, l) => s + Number(l.novos), 0) || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Selector de período */}
      <div style={{
        background: C.surface, borderRadius: '0.875rem', padding: '0.875rem 1.25rem',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(1,22,64,0.06)',
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center'
      }}>
        {[
          { key: 'hoje',   label: 'Hoje' },
          { key: 'semana', label: 'Esta semana' },
          { key: 'mes',    label: 'Este mês' },
          { key: 'livre',  label: 'Período livre' },
        ].map(p => (
          <button key={p.key} onClick={() => { setPeriodo(p.key); if (p.key !== 'livre') carregar(p.key) }} style={{
            background: periodo === p.key ? C.navy : '#f1f5f9',
            color: periodo === p.key ? C.white : C.muted,
            border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s'
          }}>{p.label}</button>
        ))}
        {periodo === 'livre' && (
          <>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', color: C.text }}
            />
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              style={{ padding: '0.4rem 0.75rem', border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', color: C.text }}
            />
            <button onClick={() => carregar('livre', dataInicio, dataFim)} style={{
              background: C.navy, color: C.white, border: 'none',
              borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif'
            }}>Aplicar</button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.subtle, fontSize: '0.875rem' }}>
          <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</span>
          A carregar…
        </div>
      ) : (
        <>
          {/* ── COMERCIAL ─────────────────────────────────────────────────── */}
          <SectionHeader title="Comercial" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* KPIs comercial */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignContent: 'start' }}>
              <KPI label="Propostas enviadas" value={totalPropostas} color={C.navy} />
              <KPI label="Valor total s/IVA"  value={formatEurInt(totalValor)} color="#2563eb" />
            </div>

            {/* Propostas por loja */}
            <Card
              title="Propostas por loja"
              empty={!dados?.propostas_por_loja?.length}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {dados?.propostas_por_loja?.map(l => (
                  <BarraHorizontal
                    key={l.loja}
                    label={l.loja}
                    value={Number(l.count)}
                    max={maxLojaPropostas}
                    color="#2563eb"
                    sub={formatEurInt(l.total_sem_iva)}
                  />
                ))}
              </div>
            </Card>

          </div>

          {/* ── OPERACIONAL ───────────────────────────────────────────────── */}
          <SectionHeader title="Operacional" />

          {/* KPIs operacional */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            <KPI label="Total ocorrências" value={totalOcorrencias} />
            <KPI label="Total limpezas"    value={dados?.total_limpezas} color="#16a34a" />
            <KPI
              label="Tempo médio resolução"
              value={dados?.tempo_medio_horas ? `${dados.tempo_medio_horas}h` : '—'}
              sub="desde abertura até resolução"
            />
            {dados?.por_estado?.map(s => (
              <KPI
                key={s.status}
                label={STATUS_LABELS[s.status]?.label || s.status}
                value={Number(s.total)}
                color={STATUS_LABELS[s.status]?.color}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <Card title="Ocorrências por categoria" empty={!dados?.por_categoria?.length}>
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
            </Card>

            <Card title="Ocorrências por loja" empty={!dados?.por_loja?.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {dados?.por_loja?.map(l => (
                  <BarraHorizontal
                    key={l.loja}
                    label={l.loja}
                    value={Number(l.total)}
                    max={maxLojaOcorrencia}
                    color={C.navy}
                  />
                ))}
              </div>
            </Card>

          </div>

          {/* ── ENTIDADES ─────────────────────────────────────────────────── */}
          <SectionHeader title="Entidades" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Condomínios por loja */}
            <Card title="Condomínios" empty={!dados?.condominios_por_loja?.length}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1.5px solid ${C.border}` }}>
                    <th style={thStyle}>Loja</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total activos</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Novos no período</th>
                  </tr>
                </thead>
                <tbody>
                  {dados?.condominios_por_loja?.map((l, i) => (
                    <tr key={l.loja} style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                      <td style={tdStyle}>{l.loja}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: C.navy }}>{Number(l.total)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: Number(l.novos) > 0 ? 700 : 400, color: Number(l.novos) > 0 ? '#7c3aed' : C.subtle }}>
                        {Number(l.novos) > 0 ? `+${Number(l.novos)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Totais */}
                  <tr style={{ borderTop: `1.5px solid ${C.border}`, background: '#f7f9fc' }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: C.text }}>Total</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.navy }}>{totalCondominios}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: novosCondominios > 0 ? '#7c3aed' : C.subtle }}>
                      {novosCondominios > 0 ? `+${novosCondominios}` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>

            {/* Prestadores */}
            <Card title="Prestadores">
              <div style={{ display: 'flex', gap: '1rem' }}>
                <KPI
                  label="Total activos"
                  value={Number(dados?.prestadores_resumo?.total || 0)}
                  color={C.navy}
                />
                <KPI
                  label="Novos no período"
                  value={Number(dados?.prestadores_resumo?.novos || 0) > 0
                    ? `+${Number(dados?.prestadores_resumo?.novos)}`
                    : '0'}
                  color={Number(dados?.prestadores_resumo?.novos || 0) > 0 ? '#0891b2' : C.subtle}
                />
              </div>
            </Card>

          </div>
        </>
      )}
    </div>
  )
}

const thStyle = {
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: '#6b7a90',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '0.5rem 0.75rem',
  color: '#334155',
  whiteSpace: 'nowrap',
}
