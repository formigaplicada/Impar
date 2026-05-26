import { useState, useEffect, useMemo } from 'react'
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
  hover:   '#f0f5ff',
  blue:    '#2563eb',
  blueL:   '#eff6ff',
}

const ESTADO_CONFIG = {
  enviada:    { label: 'Enviada',    dot: '#2563eb', bg: '#eff6ff', color: '#1d4ed8' },
  adjudicada: { label: 'Adjudicada', dot: '#16a34a', bg: '#f0fdf4', color: '#15803d' },
  recusada:   { label: 'Recusada',   dot: '#dc2626', bg: '#fef2f2', color: '#b91c1c' },
  cancelada:  { label: 'Cancelada',  dot: '#94a3b8', bg: '#f8fafc', color: '#64748b' },
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatEnvio(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return '—'
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hh    = String(d.getHours()).padStart(2, '0')
  const mm    = String(d.getMinutes()).padStart(2, '0')
  return (
    <span>
      <span style={{ color: C.text, fontWeight: 500 }}>{day}/{month}</span>
      <span style={{ color: C.subtle, fontSize: '0.78rem', marginLeft: '0.3rem' }}>{hh}:{mm}</span>
    </span>
  )
}

function formatEnvioSort(val) {
  if (!val) return 0
  return new Date(val).getTime() || 0
}

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatEur(val, decimals = 2) {
  if (val == null || val === '') return '—'
  return Number(val).toLocaleString('pt-PT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  })
}

function formatEurInt(val) {
  if (val == null || val === '') return '—'
  const n = Math.round(Number(val))
  return n.toLocaleString('pt-PT') + ' €'
}

function truncate(str, max) {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ estado }) {
  const cfg = ESTADO_CONFIG[estado] || { label: estado, dot: '#94a3b8', bg: '#f1f5f9', color: '#64748b' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      background: cfg.bg, color: cfg.color,
      borderRadius: '0.375rem', padding: '0.2rem 0.6rem',
      fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

// ── SortIcon ──────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 4, opacity: active ? 1 : 0.3 }}>
      <span style={{ fontSize: 7, lineHeight: 1, color: active && dir === 'asc'  ? C.navy : C.subtle }}>▲</span>
      <span style={{ fontSize: 7, lineHeight: 1, color: active && dir === 'desc' ? C.navy : C.subtle }}>▼</span>
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

function Pagination({ total, page, onChange }) {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  const start = (page - 1) * PAGE_SIZE + 1
  const end   = Math.min(page * PAGE_SIZE, total)

  // show max 5 page buttons around current
  const pageNums = []
  const delta = 2
  for (let i = Math.max(1, page - delta); i <= Math.min(pages, page + delta); i++) pageNums.push(i)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderTop: `1px solid ${C.border}`, flexWrap: 'wrap', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.8rem', color: C.muted }}>
        {start}–{end} de <strong style={{ color: C.text }}>{total}</strong>
      </span>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <PgBtn onClick={() => onChange(1)}       disabled={page === 1}     label="«" />
        <PgBtn onClick={() => onChange(page - 1)} disabled={page === 1}    label="‹" />
        {pageNums[0] > 1 && <PgBtn disabled label="…" />}
        {pageNums.map(n => (
          <PgBtn key={n} onClick={() => onChange(n)} active={n === page} label={n} />
        ))}
        {pageNums[pageNums.length - 1] < pages && <PgBtn disabled label="…" />}
        <PgBtn onClick={() => onChange(page + 1)} disabled={page === pages} label="›" />
        <PgBtn onClick={() => onChange(pages)}    disabled={page === pages} label="»" />
      </div>
    </div>
  )
}

function PgBtn({ onClick, disabled, active, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 32, height: 32, borderRadius: '0.375rem',
      border: active ? `1.5px solid ${C.navy}` : `1px solid ${C.border}`,
      background: active ? C.navy : disabled ? 'transparent' : C.white,
      color: active ? C.white : disabled ? C.subtle : C.text,
      fontSize: '0.8rem', fontWeight: active ? 700 : 400,
      cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'DM Sans, sans-serif',
      transition: 'all 0.12s',
    }}>
      {label}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Propostas() {
  const [propostas, setPropostas]   = useState([])
  const [lojas, setLojas]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [filtroLoja, setFiltroLoja] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroSearch, setFiltroSearch] = useState('')
  const [detalhe, setDetalhe]       = useState(null)
  const [sortCol, setSortCol]       = useState('data_envio')
  const [sortDir, setSortDir]       = useState('desc')
  const [page, setPage]             = useState(1)

  const [novoEstado, setNovoEstado] = useState('')
  const [notas, setNotas]           = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [erro, setErro]             = useState('')

  const totalGlobal = useMemo(() => propostas.reduce((s, p) => s + (Number(p.total_sem_iva) || 0), 0), [propostas])

  useEffect(() => {
    api.get('/lojas').then(d => setLojas(d?.lojas || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    setPage(1)
    const params = new URLSearchParams()
    if (filtroLoja)   params.set('loja_id', filtroLoja)
    if (filtroEstado) params.set('estado',  filtroEstado)
    if (filtroSearch) params.set('search',  filtroSearch)
    const qs = params.toString()
    api.get('/propostas' + (qs ? '?' + qs : '')).then(d => {
      setPropostas(d?.propostas || [])
      setLoading(false)
    })
  }, [filtroLoja, filtroEstado, filtroSearch])

  // ── Sort ──────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    const arr = [...propostas]
    arr.sort((a, b) => {
      let va, vb
      if (sortCol === 'data_envio') {
        va = formatEnvioSort(a.data_envio)
        vb = formatEnvioSort(b.data_envio)
      } else if (sortCol === 'total_sem_iva') {
        va = Number(a.total_sem_iva) || 0
        vb = Number(b.total_sem_iva) || 0
      } else if (sortCol === 'n_fracoes') {
        va = Number(a.n_fracoes) || 0
        vb = Number(b.n_fracoes) || 0
      } else {
        va = (a[sortCol] || '').toString().toLowerCase()
        vb = (b[sortCol] || '').toString().toLowerCase()
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return arr
  }, [propostas, sortCol, sortDir])

  const paged = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const hasFilters = filtroLoja || filtroEstado || filtroSearch
  const isFiltered = hasFilters

  function clearFilters() {
    setFiltroLoja('')
    setFiltroEstado('')
    setFiltroSearch('')
  }

  // ── Detalhe ───────────────────────────────────────────────────────────────

  function abrirDetalhe(p) {
    setDetalhe(p)
    setNovoEstado('')
    setNotas('')
    setErro('')
  }

  async function confirmarEstado() {
    if (!novoEstado) return
    setSalvando(true)
    setErro('')
    try {
      const res = await api.put(`/propostas/${detalhe.id}/estado`, { estado: novoEstado, notas: notas || null })
      if (res?.ok) {
        const atualizado = { ...detalhe, estado: novoEstado }
        setDetalhe(atualizado)
        setPropostas(prev => prev.map(p => p.id === detalhe.id ? atualizado : p))
        setNovoEstado('')
        setNotas('')
      } else {
        setErro(res?.error || 'Erro ao actualizar estado.')
      }
    } catch {
      setErro('Erro ao actualizar estado.')
    } finally {
      setSalvando(false)
    }
  }

  // ── Painel de detalhe ─────────────────────────────────────────────────────

  if (detalhe) return (
    <div style={{ animation: 'fadeIn 0.18s ease' }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }`}</style>

      <button onClick={() => setDetalhe(null)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: C.blue, fontSize: '0.875rem', marginBottom: '1.75rem',
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.4rem 0.75rem', borderRadius: '0.375rem',
        transition: 'background 0.12s', fontFamily: 'DM Sans, sans-serif',
        fontWeight: 500,
      }}
        onMouseEnter={e => e.currentTarget.style.background = C.blueL}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        ← Voltar às propostas
      </button>

      {/* Cabeçalho do detalhe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
              {detalhe.codigo}
            </h2>
            <Badge estado={detalhe.estado} />
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: C.muted }}>
            {detalhe.loja_nome || '—'} · Enviada em {formatDateTime(detalhe.data_envio)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            {formatEur(detalhe.total_sem_iva)}
          </div>
          <div style={{ fontSize: '0.72rem', color: C.muted }}>total s/IVA</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        <DetailCard title="Lead">
          <Row label="Nome"        value={detalhe.nome} />
          <Row label="Email"       value={detalhe.email} />
          <Row label="Telefone"    value={detalhe.telefone} />
          <Row label="Morada"      value={[detalhe.morada, detalhe.n_porta].filter(Boolean).join(' ')} />
          <Row label="Localidade"  value={detalhe.localidade} />
          <Row label="Cód. Postal" value={detalhe.codigo_postal} />
        </DetailCard>

        <DetailCard title="Condomínio">
          <Row label="Frações"    value={detalhe.n_fracoes ?? '—'} />
          <Row label="Limpeza"    value={detalhe.limpeza || '—'} />
          <Row label="Jardinagem" value={detalhe.jardinagem || '—'} />
          <Row label="Outros"     value={detalhe.outros_servicos || '—'} />
          {detalhe.comentarios && <Row label="Comentários" value={detalhe.comentarios} />}
        </DetailCard>

        <DetailCard title="Preços">
          <Row label="Gestão"     value={formatEur(detalhe.preco_gestao)} />
          <Row label="Limpeza"    value={formatEur(detalhe.preco_limpeza)} />
          <Row label="Jardinagem" value={formatEur(detalhe.preco_jardinagem)} />
          <Row label="Outros"     value={formatEur(detalhe.preco_outros)} />
          <div style={{ borderTop: `1px solid ${C.borderL}`, marginTop: '0.5rem', paddingTop: '0.5rem' }}>
            <Row label="Total s/IVA" value={<strong style={{ color: C.navy }}>{formatEur(detalhe.total_sem_iva)}</strong>} />
          </div>
        </DetailCard>

        <DetailCard title="Links">
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
            {detalhe.link_pdf         && <LinkBtn href={detalhe.link_pdf}         icon="📄" label="PDF Proposta" />}
            {detalhe.link_gm          && <LinkBtn href={detalhe.link_gm}          icon="📍" label="Google Maps" />}
            {detalhe.link_street_view && <LinkBtn href={detalhe.link_street_view} icon="🏙" label="Street View" />}
          </div>
        </DetailCard>

        {(detalhe.utm_source || detalhe.pagina_origem) && (
          <div style={{ gridColumn: '1 / -1' }}>
            <DetailCard title="Origem">
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 1rem' }}>
  <Row label="Source"   value={detalhe.utm_source} />
  <Row label="Medium"   value={detalhe.utm_medium} />
  <Row label="Campaign" value={detalhe.utm_campaign} />
  <Row label="Content"  value={detalhe.utm_content} />
  <Row label="Term"     value={detalhe.utm_term} />
</div>
{detalhe.pagina_origem && (
  <div style={{ borderTop: `1px solid ${C.borderL}`, marginTop: '0.25rem', paddingTop: '0.25rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.3rem 0', gap: '1rem' }}>
      <span style={{ fontSize: '0.78rem', color: C.subtle, whiteSpace: 'nowrap', flexShrink: 0 }}>Página</span>
      <span style={{ fontSize: '0.78rem', color: C.text, wordBreak: 'break-all', textAlign: 'right' }}>{detalhe.pagina_origem}</span>
    </div>
  </div>
)}
            </DetailCard>
          </div>
        )}

        {detalhe.estado === 'enviada' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <DetailCard title="Actualizar Estado">
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <select
                  value={novoEstado}
                  onChange={e => setNovoEstado(e.target.value)}
                  style={{ ...selectStyle, minWidth: '160px' }}
                >
                  <option value="">Seleccionar estado...</option>
                  <option value="adjudicada">Adjudicada</option>
                  <option value="recusada">Recusada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                <input
                  placeholder="Notas (opcional)"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: '200px', width: 'auto' }}
                />
                <button
                  onClick={confirmarEstado}
                  disabled={!novoEstado || salvando}
                  style={{
                    background: novoEstado ? C.navy : C.border,
                    color: novoEstado ? C.white : C.subtle,
                    border: 'none', borderRadius: '0.375rem',
                    padding: '0.5rem 1.25rem', fontSize: '0.875rem',
                    fontWeight: 600, cursor: novoEstado ? 'pointer' : 'default',
                    fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                    transition: 'background 0.15s'
                  }}
                >
                  {salvando ? 'A guardar…' : 'Confirmar'}
                </button>
              </div>
              {erro && <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{erro}</p>}
            </DetailCard>
          </div>
        )}

      </div>
    </div>
  )

  // ── Listagem ──────────────────────────────────────────────────────────────

  const COLS = [
    { key: 'data_envio',    label: 'Envio',      align: 'left'  },
    { key: 'localidade',    label: 'Localidade', align: 'left'  },
    { key: 'loja_nome',     label: 'Loja',       align: 'left'  },
    { key: 'n_fracoes',     label: '#',          align: 'center'},
    { key: 'total_sem_iva', label: 'Total',      align: 'right' },
  ]

  return (
    <div style={{ animation: 'fadeIn 0.18s ease' }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }
        .prop-row:hover td { background: ${C.hover} !important; }
        .prop-row { transition: background 0.12s; }
        .th-sort:hover { color: ${C.navy} !important; cursor: pointer; }
      `}</style>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Pesquisar nome, email, código…"
          value={filtroSearch}
          onChange={e => { setFiltroSearch(e.target.value); setPage(1) }}
          style={{ ...inputStyle, width: '240px' }}
        />
        <select value={filtroLoja} onChange={e => { setFiltroLoja(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">Todos os estados</option>
          <option value="enviada">Enviada</option>
          <option value="adjudicada">Adjudicada</option>
          <option value="recusada">Recusada</option>
          <option value="cancelada">Cancelada</option>
        </select>

        {isFiltered && (
          <button onClick={clearFilters} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.375rem',
            padding: '0.45rem 0.875rem', fontSize: '0.8rem', color: C.muted,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            transition: 'all 0.12s'
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
          >
            × Limpar filtros
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: C.muted }}>
            {isFiltered
              ? <><strong style={{ color: C.text }}>{sorted.length}</strong> de <strong style={{ color: C.text }}>{propostas.length}</strong> propostas</>
              : <><strong style={{ color: C.text }}>{propostas.length}</strong> propostas</>
            }
          </span>
          <span style={{ fontSize: '0.8rem', color: C.muted }}>
            <strong style={{ color: C.text }}>{formatEurInt(totalGlobal)}</strong> total s/IVA
          </span>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: C.surface, borderRadius: '0.875rem', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
              <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '1.25rem' }}>⏳</span>
              A carregar…
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
              <span style={{ display: 'block', marginBottom: '0.5rem', fontSize: '1.5rem' }}>🔍</span>
              Nenhuma proposta encontrada.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: 480 }}>
              <thead>
                <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className="th-sort"
                      onClick={() => toggleSort(col.key)}
                      style={{
                        padding: '0.7rem 1rem',
                        textAlign: col.align,
                        fontWeight: 600,
                        color: sortCol === col.key ? C.navy : C.muted,
                        fontSize: '0.775rem',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        transition: 'color 0.12s',
                        letterSpacing: '0.02em',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {col.label}
                        <SortIcon active={sortCol === col.key} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => (
                  <tr
                    key={p.id}
                    className="prop-row"
                    onClick={() => abrirDetalhe(p)}
                    style={{ borderBottom: `1px solid ${C.borderL}`, cursor: 'pointer' }}
                  >
                    <td style={{ ...td, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                      {formatEnvio(p.data_envio)}
                    </td>
                    <td style={{ ...td, textAlign: 'left', maxWidth: 140, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                      {truncate(p.localidade, 30)}
                    </td>
                    <td style={td}>{p.loja_nome || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 600, color: C.navy }}>
                      {p.n_fracoes ?? '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                      {formatEurInt(p.total_sem_iva)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination total={sorted.length} page={page} onChange={setPage} />
      </div>
    </div>
  )
}

// ── Detail helpers ────────────────────────────────────────────────────────────

function DetailCard({ title, children }) {
  return (
    <div style={{
      background: C.surface, borderRadius: '0.75rem',
      border: `1px solid ${C.border}`, padding: '1.25rem 1.5rem',
      boxShadow: '0 1px 3px rgba(1,22,64,0.05)'
    }}>
      <h3 style={{
        fontSize: '0.7rem', fontWeight: 700, color: C.subtle,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: '0.875rem', margin: '0 0 0.875rem'
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '0.3rem 0', borderBottom: `1px solid ${C.borderL}`, gap: '1rem'
    }}>
      <span style={{ fontSize: '0.78rem', color: C.subtle, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: C.text, textAlign: 'right', wordBreak: 'break-word' }}>{value ?? '—'}</span>
    </div>
  )
}

function LinkBtn({ href, icon, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.4rem 0.875rem', borderRadius: '0.375rem',
      background: C.blueL, color: C.blue,
      fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
      transition: 'background 0.12s'
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
      onMouseLeave={e => e.currentTarget.style.background = C.blueL}
    >
      {icon} {label}
    </a>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const td = {
  padding: '0.7rem 1rem',
  color: '#334155',
  whiteSpace: 'nowrap',
}

const inputStyle = {
  padding: '0.475rem 0.75rem',
  borderRadius: '0.375rem',
  border: `1px solid ${C.border}`,
  fontSize: '0.875rem',
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  color: C.text,
  background: C.white,
  transition: 'border-color 0.12s',
}

const selectStyle = {
  padding: '0.475rem 0.75rem',
  borderRadius: '0.375rem',
  border: `1px solid ${C.border}`,
  fontSize: '0.875rem',
  fontFamily: 'DM Sans, sans-serif',
  background: C.white,
  outline: 'none',
  color: C.text,
  cursor: 'pointer',
}
