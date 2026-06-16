import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

// ── Paleta Ímpar (consistente com Dashboard) ──────────────────────────────────
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

// ── Enums ─────────────────────────────────────────────────────────────────────
const TIPOS_REUNIAO = [
  { key: 'ago',           label: 'AGO',           color: '#2563eb', bg: '#eff6ff' },
  { key: 'extraordinaria',label: 'Extraordinária', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'apresentacao',  label: 'Apresentação',   color: '#0891b2', bg: '#ecfeff' },
  { key: 'assinaturas',   label: 'Assinaturas',    color: '#d97706', bg: '#fffbeb' },
  { key: 'outro',         label: 'Outro',          color: '#64748b', bg: '#f8fafc' },
]

const ESTADOS_ATA = [
  { key: 'pendente',        label: 'Pendente',        color: '#64748b', bg: '#f1f5f9' },
  { key: 'pronta',          label: 'Pronta',           color: '#16a34a', bg: '#dcfce7' },
  { key: 'em_assinaturas',  label: 'Em assinaturas',  color: '#d97706', bg: '#fef3c7' },
  { key: 'assinada',        label: 'Assinada',         color: '#2563eb', bg: '#eff6ff' },
]

const TIPOS_EVENTO = [
  { key: 'presencial', label: 'Presencial', icon: '📍' },
  { key: 'online',     label: 'Online',     icon: '💻' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function cfgTipo(key)   { return TIPOS_REUNIAO.find(t => t.key === key)  || TIPOS_REUNIAO[4] }
function cfgAta(key)    { return ESTADOS_ATA.find(s => s.key === key)    || ESTADOS_ATA[0] }
function cfgEvento(key) { return TIPOS_EVENTO.find(e => e.key === key)   || TIPOS_EVENTO[0] }

function formatDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function formatDataCurta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
}

function formatHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

function diasAte(iso) {
  if (!iso) return null
  const diff = new Date(iso) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function mesLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}

function isoParaInputDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg, small }) {
  return (
    <span style={{
      background: bg, color,
      borderRadius: '0.3rem',
      padding: small ? '0.1rem 0.4rem' : '0.2rem 0.6rem',
      fontSize: small ? '0.68rem' : '0.72rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Modal overlay ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: C.white, borderRadius: '1rem',
        width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
        padding: '2rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1.4rem', color: C.muted, lineHeight: 1, padding: '0.25rem',
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Formulário criar/editar ───────────────────────────────────────────────────
const FORM_VAZIO = {
  condominio_id: '',
  condominio_texto: '',
  localidade: '',
  loja_id: '',
  filial_texto: '',
  data_hora: '',
  tipo_reuniao: 'ago',
  tipo_evento: 'presencial',
  local_evento: '',
  gestor: '',
  estado_ata: 'pendente',
  comentarios: '',
}

function FormReuniao({ inicial, condominios, lojas, onGuardar, onCancelar, loading }) {
  const [form, setForm] = useState(inicial || FORM_VAZIO)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const labelInput = { fontSize: '0.75rem', fontWeight: 600, color: C.muted, marginBottom: '0.3rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text, background: C.white, boxSizing: 'border-box' }
  const selectStyle = { ...inputStyle }
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }

  return (
    <div>
      {/* Condomínio */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelInput}>Condomínio</label>
        <select
          value={form.condominio_id}
          onChange={e => {
            const id = e.target.value
            set('condominio_id', id)
            if (id) {
              const c = condominios.find(c => c.id === id)
              if (c) set('condominio_texto', c.nome)
            }
          }}
          style={selectStyle}
        >
          <option value="">— Seleccionar (opcional) —</option>
          {condominios.map(c => (
            <option key={c.id} value={c.id}>{c.n_impar} — {c.nome}</option>
          ))}
        </select>
        {!form.condominio_id && (
          <input
            style={{ ...inputStyle, marginTop: '0.5rem' }}
            placeholder="Ou escreve o nome/morada livremente"
            value={form.condominio_texto}
            onChange={e => set('condominio_texto', e.target.value)}
          />
        )}
      </div>

      {/* Localidade + Loja */}
      <div style={row}>
        <div>
          <label style={labelInput}>Localidade</label>
          <input style={inputStyle} value={form.localidade} onChange={e => set('localidade', e.target.value)} placeholder="Ex: Lisboa" />
        </div>
        <div>
          <label style={labelInput}>Loja / Filial</label>
          <select
            value={form.loja_id}
            onChange={e => { set('loja_id', e.target.value); set('filial_texto', '') }}
            style={selectStyle}
          >
            <option value="">— Seleccionar —</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {!form.loja_id && (
            <input
              style={{ ...inputStyle, marginTop: '0.5rem' }}
              placeholder="Filial (texto livre)"
              value={form.filial_texto}
              onChange={e => set('filial_texto', e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Data + Gestor */}
      <div style={row}>
        <div>
          <label style={labelInput}>Data e Hora *</label>
          <input type="datetime-local" style={inputStyle} value={form.data_hora} onChange={e => set('data_hora', e.target.value)} required />
        </div>
        <div>
          <label style={labelInput}>Gestor</label>
          <input style={inputStyle} value={form.gestor} onChange={e => set('gestor', e.target.value)} placeholder="Nome do gestor" />
        </div>
      </div>

      {/* Tipo reunião + tipo evento */}
      <div style={row}>
        <div>
          <label style={labelInput}>Tipo de reunião</label>
          <select style={selectStyle} value={form.tipo_reuniao} onChange={e => set('tipo_reuniao', e.target.value)}>
            {TIPOS_REUNIAO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelInput}>Formato</label>
          <select style={selectStyle} value={form.tipo_evento} onChange={e => set('tipo_evento', e.target.value)}>
            {TIPOS_EVENTO.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Local / Link */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelInput}>{form.tipo_evento === 'online' ? 'Link (Zoom/Teams/Meet)' : 'Morada do evento'}</label>
        <input
          style={inputStyle}
          value={form.local_evento}
          onChange={e => set('local_evento', e.target.value)}
          placeholder={form.tipo_evento === 'online' ? 'https://zoom.us/j/...' : 'Morada completa'}
        />
      </div>

      {/* Estado ata */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelInput}>Estado da ata</label>
        <select style={selectStyle} value={form.estado_ata} onChange={e => set('estado_ata', e.target.value)}>
          {ESTADOS_ATA.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Comentários */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={labelInput}>Comentários</label>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: '4rem' }}
          value={form.comentarios}
          onChange={e => set('comentarios', e.target.value)}
          placeholder="Notas livres..."
        />
      </div>

      {/* Acções */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button onClick={onCancelar} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
          padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer', color: C.muted,
          fontFamily: 'DM Sans, sans-serif',
        }}>Cancelar</button>
        <button
          onClick={() => onGuardar(form)}
          disabled={!form.data_hora || loading}
          style={{
            background: C.navy, color: C.white, border: 'none',
            borderRadius: '0.5rem', padding: '0.5rem 1.5rem',
            fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            opacity: (!form.data_hora || loading) ? 0.6 : 1,
          }}
        >{loading ? 'A guardar…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

// ── Linha da tabela ───────────────────────────────────────────────────────────
function LinhaReuniao({ r, onEditar, onApagar }) {
  const dias   = diasAte(r.data_hora)
  const tipo   = cfgTipo(r.tipo_reuniao)
  const ata    = cfgAta(r.estado_ata)
  const evento = cfgEvento(r.tipo_evento)
  const passou = dias !== null && dias < 0

  return (
    <tr style={{ borderBottom: `1px solid ${C.borderL}`, opacity: passou ? 0.65 : 1 }}>
      {/* Data / Hora */}
      <td style={{ ...td, minWidth: 90 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
          {formatDataCurta(r.data_hora)}
        </div>
        <div style={{ fontSize: '0.75rem', color: C.muted }}>{formatHora(r.data_hora)}</div>
        {!passou && dias !== null && dias <= 7 && (
          <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>
            {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `${dias}d`}
          </div>
        )}
      </td>

      {/* Condomínio */}
      <td style={{ ...td, maxWidth: 220 }}>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.condominio_nome || r.condominio_texto || <span style={{ color: C.subtle }}>—</span>}
        </div>
        {r.localidade && <div style={{ fontSize: '0.72rem', color: C.muted }}>{r.localidade}</div>}
      </td>

      {/* Loja */}
      <td style={{ ...td, fontSize: '0.78rem', color: C.muted, whiteSpace: 'nowrap' }}>
        {r.loja_nome || r.filial_texto || '—'}
      </td>

      {/* Gestor */}
      <td style={{ ...td, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
        {r.gestor || <span style={{ color: C.subtle }}>—</span>}
      </td>

      {/* Tipo reunião */}
      <td style={td}>
        <Badge label={tipo.label} color={tipo.color} bg={tipo.bg} small />
      </td>

      {/* Formato + local */}
      <td style={{ ...td, maxWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
          <span>{evento.icon}</span>
          {r.local_evento
            ? r.tipo_evento === 'online'
              ? <a href={r.local_evento} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '0.72rem' }}>Link</a>
              : <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120, display: 'inline-block' }}>{r.local_evento}</span>
            : <span style={{ color: C.subtle }}>—</span>
          }
        </div>
      </td>

      {/* Estado ata */}
      <td style={td}>
        <Badge label={ata.label} color={ata.color} bg={ata.bg} small />
      </td>

      {/* Comentários */}
      <td style={{ ...td, maxWidth: 200 }}>
        {r.comentarios
          ? <span style={{ fontSize: '0.75rem', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 200 }} title={r.comentarios}>{r.comentarios}</span>
          : <span style={{ color: C.subtle }}>—</span>
        }
      </td>

      {/* Acções */}
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={() => onEditar(r)} style={btnAcao(C.navy)}>Editar</button>
        <button onClick={() => onApagar(r)} style={{ ...btnAcao('#dc2626'), marginLeft: '0.5rem' }}>Apagar</button>
      </td>
    </tr>
  )
}

const td = { padding: '0.6rem 0.75rem', color: C.text, verticalAlign: 'middle' }
const btnAcao = color => ({
  background: 'none', border: `1px solid ${color}`, borderRadius: '0.35rem',
  padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', color,
  fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
})

// ── Componente principal ──────────────────────────────────────────────────────
export default function Agenda() {
  const [reunioes,    setReunioes]    = useState([])
  const [lojas,       setLojas]       = useState([])
  const [condominios, setCondominios] = useState([])
  const [gestores,    setGestores]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState(null)

  // Filtros
  const [filtroGestor,   setFiltroGestor]   = useState('')
  const [filtroLoja,     setFiltroLoja]     = useState('')
  const [filtroMes,      setFiltroMes]      = useState('')
  const [filtroAta,      setFiltroAta]      = useState('')

  // Modal
  const [modal,          setModal]          = useState(null) // null | 'criar' | 'editar'
  const [reuniaoEditar,  setReuniaoEditar]  = useState(null)
  const [loadingGuardar, setLoadingGuardar] = useState(false)

  // Confirmação apagar
  const [apagarId,       setApagarId]       = useState(null)

  // ── Carregar dados base ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/lojas').then(r => r.lojas || []),
      api.get('/condominios').then(r => r.condominios || []),
      api.get('/eventos/gestores').then(r => r.gestores || []),
    ]).then(([l, c, g]) => {
      setLojas(l)
      setCondominios(c)
      setGestores(g)
    })
  }, [])

  // ── Carregar reuniões (com filtros) ───────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (filtroGestor) params.set('gestor',     filtroGestor)
      if (filtroLoja)   params.set('loja_id',    filtroLoja)
      if (filtroMes)    params.set('mes',         filtroMes)
      if (filtroAta)    params.set('estado_ata',  filtroAta)
      const data = await api.get(`/eventos?${params}`)
      setReunioes(data.eventos || [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [filtroGestor, filtroLoja, filtroMes, filtroAta])

  useEffect(() => { carregar() }, [carregar])

  // ── Criar ──────────────────────────────────────────────────────────────────
  async function handleCriar(form) {
    setLoadingGuardar(true)
    try {
      await api.post('/eventos', { ...form, formato: form.tipo_evento, estado: form.estado_ata, data_hora: form.data_hora ? new Date(form.data_hora).toISOString() : null })
      setModal(null)
      carregar()
    } catch (e) {
      alert('Erro ao criar: ' + e.message)
    } finally {
      setLoadingGuardar(false)
    }
  }

  // ── Editar ─────────────────────────────────────────────────────────────────
  async function handleEditar(form) {
    setLoadingGuardar(true)
    try {
      await api.put(`/eventos/${reuniaoEditar.id}`, { ...form, formato: form.tipo_evento, estado: form.estado_ata, data_hora: form.data_hora ? new Date(form.data_hora).toISOString() : null })
      setModal(null)
      setReuniaoEditar(null)
      carregar()
    } catch (e) {
      alert('Erro ao guardar: ' + e.message)
    } finally {
      setLoadingGuardar(false)
    }
  }

  // ── Apagar ─────────────────────────────────────────────────────────────────
  async function handleApagar() {
    try {
      await api.delete(`/eventos/${apagarId}`)
      setApagarId(null)
      carregar()
    } catch (e) {
      alert('Erro ao apagar: ' + e.message)
    }
  }

  // ── Agrupar por mês ───────────────────────────────────────────────────────
  const grupos = []
  let mesAtual = null
  for (const r of reunioes) {
    const m = r.data_hora ? new Date(r.data_hora).toISOString().slice(0, 7) : 'sem-data'
    if (m !== mesAtual) {
      mesAtual = m
      grupos.push({ mes: m, label: mesLabel(r.data_hora), rows: [] })
    }
    grupos[grupos.length - 1].rows.push(r)
  }

  // ── Meses disponíveis para filtro (gerados dinamicamente a partir dos dados) ─
  const mesesDisponiveis = [...new Set(reunioes.map(r => r.data_hora?.slice(0, 7)).filter(Boolean))].sort()

  const inputStyle = {
    padding: '0.4rem 0.75rem', border: `1px solid ${C.border}`,
    borderRadius: '0.5rem', fontSize: '0.82rem',
    fontFamily: 'DM Sans, sans-serif', color: C.text, background: C.white,
  }
  const thStyle = {
    padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600,
    fontSize: '0.72rem', color: C.subtle, letterSpacing: '0.04em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    borderBottom: `1.5px solid ${C.border}`, background: '#f7f9fc',
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'DM Sans, sans-serif', background: C.bg, minHeight: '100vh' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: C.navy }}>Agenda de Reuniões</h1>
          <p style={{ margin: '0.25rem 0 0', color: C.muted, fontSize: '0.82rem' }}>
            {loading ? '…' : `${reunioes.length} reunião(s) encontrada(s)`}
          </p>
        </div>
        <button onClick={() => { setModal('criar'); setReuniaoEditar(null) }} style={{
          background: C.navy, color: C.white, border: 'none',
          borderRadius: '0.6rem', padding: '0.6rem 1.25rem',
          fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}>+ Nova Reunião</button>
      </div>

      {/* ── Filtros ── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Gestor */}
        <select value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)} style={inputStyle}>
          <option value="">Todos os gestores</option>
          {gestores.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* Loja */}
        <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} style={inputStyle}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>

        {/* Mês */}
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={inputStyle}>
          <option value="">Todos os meses</option>
          {mesesDisponiveis.map(m => {
            const d = new Date(m + '-01')
            const label = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
            return <option key={m} value={m}>{label}</option>
          })}
        </select>

        {/* Estado ata */}
        <select value={filtroAta} onChange={e => setFiltroAta(e.target.value)} style={inputStyle}>
          <option value="">Todos os estados de ata</option>
          {ESTADOS_ATA.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {(filtroGestor || filtroLoja || filtroMes || filtroAta) && (
          <button onClick={() => { setFiltroGestor(''); setFiltroLoja(''); setFiltroMes(''); setFiltroAta('') }}
            style={{ ...inputStyle, cursor: 'pointer', color: '#dc2626', border: `1px solid #fecaca`, background: '#fef2f2', fontWeight: 600 }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ── */}
      {erro ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1.25rem', color: '#dc2626' }}>
          Erro ao carregar reuniões: {erro}
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.subtle }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
          A carregar…
        </div>
      ) : reunioes.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
          Nenhuma reunião encontrada para os filtros seleccionados.
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data / Hora</th>
                  <th style={thStyle}>Condomínio</th>
                  <th style={thStyle}>Loja</th>
                  <th style={thStyle}>Gestor</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Formato</th>
                  <th style={thStyle}>Ata</th>
                  <th style={thStyle}>Comentários</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Acções</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => (
                  <>
                    <tr key={`mes-${g.mes}`}>
                      <td colSpan={9} style={{
                        padding: '0.5rem 0.75rem',
                        background: '#f0f3f7',
                        fontSize: '0.72rem', fontWeight: 800,
                        color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em',
                        borderBottom: `1px solid ${C.border}`,
                      }}>
                        {g.label} — {g.rows.length} reunião(ões)
                      </td>
                    </tr>
                    {g.rows.map(r => (
                      <LinhaReuniao
                        key={r.id}
                        r={r}
                        onEditar={r => { setReuniaoEditar(r); setModal('editar') }}
                        onApagar={r => setApagarId(r.id)}
                      />
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal Criar ── */}
      {modal === 'criar' && (
        <Modal title="Nova Reunião" onClose={() => setModal(null)}>
          <FormReuniao
            condominios={condominios}
            lojas={lojas}
            onGuardar={handleCriar}
            onCancelar={() => setModal(null)}
            loading={loadingGuardar}
          />
        </Modal>
      )}

      {/* ── Modal Editar ── */}
      {modal === 'editar' && reuniaoEditar && (
        <Modal title="Editar Reunião" onClose={() => { setModal(null); setReuniaoEditar(null) }}>
          <FormReuniao
            inicial={{
              condominio_id:    reuniaoEditar.condominio_id    || '',
              condominio_texto: reuniaoEditar.condominio_texto || '',
              localidade:       reuniaoEditar.localidade       || '',
              loja_id:          reuniaoEditar.loja_id          || '',
              filial_texto:     reuniaoEditar.filial_texto     || '',
              data_hora:        isoParaInputDatetime(reuniaoEditar.data_hora),
              tipo_reuniao:     reuniaoEditar.tipo_reuniao     || 'outro',
              tipo_evento:      reuniaoEditar.tipo_evento      || 'presencial',
              local_evento:     reuniaoEditar.local_evento     || '',
              gestor:           reuniaoEditar.gestor           || '',
              estado_ata:       reuniaoEditar.estado_ata       || 'pendente',
              comentarios:      reuniaoEditar.comentarios      || '',
            }}
            condominios={condominios}
            lojas={lojas}
            onGuardar={handleEditar}
            onCancelar={() => { setModal(null); setReuniaoEditar(null) }}
            loading={loadingGuardar}
          />
        </Modal>
      )}

      {/* ── Confirmação apagar ── */}
      {apagarId && (
        <Modal title="Confirmar eliminação" onClose={() => setApagarId(null)}>
          <p style={{ color: C.text, marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            Tens a certeza que queres apagar esta reunião? Esta acção não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button onClick={() => setApagarId(null)} style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem', cursor: 'pointer', color: C.muted, fontFamily: 'DM Sans, sans-serif',
            }}>Cancelar</button>
            <button onClick={handleApagar} style={{
              background: '#dc2626', color: C.white, border: 'none',
              borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}>Apagar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
