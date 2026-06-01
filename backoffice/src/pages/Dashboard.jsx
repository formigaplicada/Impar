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

// Origem config — label, cor de fundo, cor de texto
const ORIGENS = [
  { key: 'ads',      label: 'Google Ads', bg: '#eff6ff', color: '#2563eb', dot: '#2563eb' },
  { key: 'organico', label: 'Orgânico',   bg: '#f0fdf4', color: '#16a34a', dot: '#16a34a' },
  { key: 'direto',   label: 'Direto',     bg: '#fafafa', color: '#64748b', dot: '#94a3b8' },
  { key: 'outros',   label: 'Outros',     bg: '#fdf4ff', color: '#9333ea', dot: '#a855f7' },
]

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
function Card({ title, children, empty, style }) {
  return (
    <div style={{
      background: C.surface, borderRadius: '0.875rem', padding: '1.25rem 1.5rem',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(1,22,64,0.06)',
      ...style
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

// ── Célula de origem (quantidade + valor) ─────────────────────────────────────
function CelulaOrigem({ total, valor, cfg }) {
  if (!total || Number(total) === 0) {
    return <td style={{ ...tdStyle, textAlign: 'center', color: C.border }}>—</td>
  }
  return (
    <td style={{ ...tdStyle, textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
        <span style={{
          fontWeight: 700, fontSize: '0.88rem',
          color: cfg.color,
          background: cfg.bg,
          borderRadius: '0.25rem',
          padding: '0.1rem 0.5rem',
          lineHeight: 1.5,
        }}>
          {Number(total)}
        </span>
        <span style={{ fontSize: '0.68rem', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
          {formatEurInt(valor)}
        </span>
      </div>
    </td>
  )
}

// ── Matriz Leads por Loja × Origem ───────────────────────────────────────────
function MatrizLeads({ dados }) {
  if (!dados?.leads_por_loja_origem?.length) {
    return <p style={{ color: C.subtle, fontSize: '0.82rem', margin: 0 }}>Sem dados para o período.</p>
  }

  // Construir estrutura: { loja: { origem: { total, valor } } }
  const mapa = {}
  const totaisPorOrigem = {}

  for (const row of dados.leads_por_loja_origem) {
    if (!mapa[row.loja]) mapa[row.loja] = {}
    mapa[row.loja][row.origem] = { total: Number(row.total), valor: Number(row.valor) }

    if (!totaisPorOrigem[row.origem]) totaisPorOrigem[row.origem] = { total: 0, valor: 0 }
    totaisPorOrigem[row.origem].total += Number(row.total)
    totaisPorOrigem[row.origem].valor += Number(row.valor)
  }

  const lojas = Object.keys(mapa).sort()

  // Totais por loja
  const totaisPorLoja = {}
  for (const loja of lojas) {
    totaisPorLoja[loja] = { total: 0, valor: 0 }
    for (const o of ORIGENS) {
      const d = mapa[loja][o.key]
      if (d) {
        totaisPorLoja[loja].total += d.total
        totaisPorLoja[loja].valor += d.valor
      }
    }
  }

  // Total global
  const totalGlobal = Object.values(totaisPorLoja).reduce((s, l) => s + l.total, 0)
  const valorGlobal = Object.values(totaisPorLoja).reduce((s, l) => s + l.valor, 0)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 480 }}>
        <thead>
          <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>Loja</th>
            {ORIGENS.map(o => (
              <th key={o.key} style={{ ...thStyle, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: o.dot, flexShrink: 0 }} />
                  {o.label}
                </span>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lojas.map((loja, i) => (
            <tr key={loja} style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc' }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{loja}</td>
              {ORIGENS.map(o => (
                <CelulaOrigem
                  key={o.key}
                  total={mapa[loja][o.key]?.total}
                  valor={mapa[loja][o.key]?.valor}
                  cfg={o}
                />
              ))}
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: C.navy }}>{totaisPorLoja[loja].total}</span>
                  <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(totaisPorLoja[loja].valor)}</span>
                </div>
              </td>
            </tr>
          ))}
          {/* Linha de totais */}
          <tr style={{ borderTop: `1.5px solid ${C.border}`, background: '#f7f9fc' }}>
            <td style={{ ...tdStyle, fontWeight: 700, color: C.text }}>Total</td>
            {ORIGENS.map(o => {
              const d = totaisPorOrigem[o.key]
              return (
                <td key={o.key} style={{ ...tdStyle, textAlign: 'center' }}>
                  {d ? (
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: o.color }}>{d.total}</span>
                      <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(d.valor)}</span>
                    </div>
                  ) : '—'}
                </td>
              )
            })}
            <td style={{ ...tdStyle, textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: C.navy }}>{totalGlobal}</span>
                <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(valorGlobal)}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Tabela Google Ads por Campanha ────────────────────────────────────────────
function TabelaAds({ dados }) {
  if (!dados?.leads_por_campanha?.length) {
    return <p style={{ color: C.subtle, fontSize: '0.82rem', margin: 0 }}>Sem leads de Google Ads no período.</p>
  }

  // Agrupar por campanha
  const mapaC = {}
  for (const row of dados.leads_por_campanha) {
    if (!mapaC[row.campanha]) mapaC[row.campanha] = { lojas: {}, total: 0, valor: 0 }
    mapaC[row.campanha].lojas[row.loja] = { total: Number(row.total), valor: Number(row.valor) }
    mapaC[row.campanha].total += Number(row.total)
    mapaC[row.campanha].valor += Number(row.valor)
  }

  const campanhas = Object.entries(mapaC).sort((a, b) => b[1].total - a[1].total)
  const maxTotal = Math.max(...campanhas.map(([, v]) => v.total), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {campanhas.map(([campanha, data]) => (
        <div key={campanha} style={{
          padding: '0.75rem 1rem',
          background: '#f8faff',
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid #2563eb`,
          borderRadius: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.navy, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campanha}
            </span>
            <div style={{ display: 'flex', gap: '1rem', flexShrink: 0 }}>
              <span style={{
                fontSize: '0.82rem', fontWeight: 800, color: '#2563eb',
                background: '#eff6ff', borderRadius: '0.25rem', padding: '0.1rem 0.5rem'
              }}>
                {data.total} lead{data.total !== 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: '0.78rem', color: C.muted, fontWeight: 500 }}>
                {formatEurInt(data.valor)}
              </span>
            </div>
          </div>
          {/* Barra de progresso */}
          <div style={{ background: '#e8f0fe', borderRadius: '9999px', height: '5px', marginBottom: '0.5rem' }}>
            <div style={{
              width: `${Math.round((data.total / maxTotal) * 100)}%`,
              background: '#2563eb', borderRadius: '9999px', height: '5px',
              transition: 'width 0.4s ease'
            }} />
          </div>
          {/* Lojas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {Object.entries(data.lojas).sort((a, b) => b[1].total - a[1].total).map(([loja, d]) => (
              <span key={loja} style={{
                fontSize: '0.7rem', color: '#1d4ed8',
                background: '#dbeafe', borderRadius: '0.25rem',
                padding: '0.1rem 0.5rem', fontWeight: 500, whiteSpace: 'nowrap'
              }}>
                {loja} · {d.total}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const ESTADOS_PROPOSTAS = [
  { key: 'enviada',    label: 'Enviada',    dot: '#2563eb', bg: '#eff6ff', color: '#1d4ed8' },
  { key: 'recebida',   label: 'Recebida',   dot: '#7c3aed', bg: '#f5f3ff', color: '#6d28d9' },
  { key: 'em_analise', label: 'Em Análise', dot: '#d97706', bg: '#fffbeb', color: '#b45309' },
  { key: 'adjudicada', label: 'Adjudicada', dot: '#16a34a', bg: '#f0fdf4', color: '#15803d' },
  { key: 'ativa',      label: 'Ativa',      dot: '#059669', bg: '#ecfdf5', color: '#047857' },
]

function MatrizPropostasEstados({ dados }) {
  if (!dados?.propostas_estados_loja?.length) {
    return <p style={{ color: C.subtle, fontSize: '0.82rem', margin: 0 }}>Sem dados para o período.</p>
  }

  // Construir mapa: { loja: { estado: { total, valor } } }
  const mapa = {}
  const totaisPorEstado = {}

  for (const row of dados.propostas_estados_loja) {
    if (!mapa[row.loja]) mapa[row.loja] = {}
    mapa[row.loja][row.estado_agrupado] = { total: Number(row.total), valor: Number(row.valor) }

    if (!totaisPorEstado[row.estado_agrupado]) totaisPorEstado[row.estado_agrupado] = { total: 0, valor: 0 }
    totaisPorEstado[row.estado_agrupado].total += Number(row.total)
    totaisPorEstado[row.estado_agrupado].valor += Number(row.valor)
  }

  const lojas = Object.keys(mapa).sort()

  const totaisPorLoja = {}
  for (const loja of lojas) {
    totaisPorLoja[loja] = { total: 0, valor: 0 }
    for (const e of ESTADOS_PROPOSTAS) {
      const d = mapa[loja][e.key]
      if (d) {
        totaisPorLoja[loja].total += d.total
        totaisPorLoja[loja].valor += d.valor
      }
    }
  }

  const totalGlobal = Object.values(totaisPorLoja).reduce((s, l) => s + l.total, 0)
  const valorGlobal = Object.values(totaisPorLoja).reduce((s, l) => s + l.valor, 0)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 480 }}>
        <thead>
          <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>Loja</th>
            {ESTADOS_PROPOSTAS.map(e => (
              <th key={e.key} style={{ ...thStyle, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.dot, flexShrink: 0 }} />
                  {e.label}
                </span>
              </th>
            ))}
            <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lojas.map((loja, i) => (
            <tr key={loja} style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc' }}>
              <td style={{ ...tdStyle, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{loja}</td>
              {ESTADOS_PROPOSTAS.map(e => {
                const d = mapa[loja][e.key]
                if (!d || d.total === 0) {
                  return <td key={e.key} style={{ ...tdStyle, textAlign: 'center', color: C.border }}>—</td>
                }
                return (
                  <td key={e.key} style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                      <span style={{
                        fontWeight: 700, fontSize: '0.88rem',
                        color: e.color, background: e.bg,
                        borderRadius: '0.25rem', padding: '0.1rem 0.5rem', lineHeight: 1.5,
                      }}>
                        {d.total}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                        {formatEurInt(d.valor)}
                      </span>
                    </div>
                  </td>
                )
              })}
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: C.navy }}>{totaisPorLoja[loja].total}</span>
                  <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(totaisPorLoja[loja].valor)}</span>
                </div>
              </td>
            </tr>
          ))}
          {/* Linha de totais */}
          <tr style={{ borderTop: `1.5px solid ${C.border}`, background: '#f7f9fc' }}>
            <td style={{ ...tdStyle, fontWeight: 700, color: C.text }}>Total</td>
            {ESTADOS_PROPOSTAS.map(e => {
              const d = totaisPorEstado[e.key]
              return (
                <td key={e.key} style={{ ...tdStyle, textAlign: 'center' }}>
                  {d ? (
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: e.color }}>{d.total}</span>
                      <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(d.valor)}</span>
                    </div>
                  ) : '—'}
                </td>
              )
            })}
            <td style={{ ...tdStyle, textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: C.navy }}>{totalGlobal}</span>
                <span style={{ fontSize: '0.68rem', color: C.muted }}>{formatEurInt(valorGlobal)}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}


// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [dados, setDados]           = useState(null)
  const [loading, setLoading]       = useState(true)
  const [periodo, setPeriodo]       = useState('semana')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]       = useState('')

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
  const totalPropostas    = dados?.propostas_por_loja?.reduce((s, l) => s + Number(l.count), 0) || 0
  const totalValor        = dados?.propostas_por_loja?.reduce((s, l) => s + Number(l.total_sem_iva), 0) || 0
  const totalCondominios  = dados?.condominios_por_loja?.reduce((s, l) => s + Number(l.total), 0) || 0
  const novosCondominios  = dados?.condominios_por_loja?.reduce((s, l) => s + Number(l.novos), 0) || 0

  // Total de leads com origem conhecida
  const totalLeads = dados?.leads_por_loja_origem?.reduce((s, r) => s + Number(r.total), 0) || 0
  const totalLeadsAds = dados?.leads_por_loja_origem
    ?.filter(r => r.origem === 'ads')
    ?.reduce((s, r) => s + Number(r.total), 0) || 0

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

          {/* KPIs comercial */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <KPI label="Propostas enviadas" value={totalPropostas} color={C.navy} />
            <KPI label="Valor total s/IVA"  value={formatEurInt(totalValor)} color="#2563eb" />
            <KPI label="Total leads"        value={totalLeads} color="#7c3aed" sub="no período" />
            <KPI label="Leads Google Ads"   value={totalLeadsAds} color="#2563eb"
              sub={totalLeads > 0 ? `${Math.round(totalLeadsAds / totalLeads * 100)}% do total` : null}
            />
          </div>

          {/* Matriz leads por loja × origem */}
          <Card title="Leads por loja e origem">
            <MatrizLeads dados={dados} />
          </Card>

          {/* Google Ads por campanha */}
          <Card title="Google Ads — leads por campanha">
            <TabelaAds dados={dados} />
          </Card>

          {/* Propostas por loja e estado */}
          <Card title="Propostas por loja e estado">
            <MatrizPropostasEstados dados={dados} />
          </Card>

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

// ── Shared styles ─────────────────────────────────────────────────────────────

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
