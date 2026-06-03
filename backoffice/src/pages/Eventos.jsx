import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import CondominioSearch from '../components/CondominioSearch'

// ── Paleta Ímpar ──────────────────────────────────────────────────────────────
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
const TIPOS_EVENTO = [
  { key: 'reuniao', label: 'Reunião', color: '#2563eb', bg: '#eff6ff' },
  // extensível: { key: 'visita', label: 'Visita', ... }
]

const TIPOS_REUNIAO = [
  { key: 'ago',            label: 'Ordinária',       color: '#2563eb', bg: '#eff6ff' },
  { key: 'extraordinaria', label: 'Extraordinária',  color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'apresentacao',   label: 'Apresentação',    color: '#0891b2', bg: '#ecfeff' },
  { key: 'assinaturas',    label: 'Assinaturas',     color: '#d97706', bg: '#fffbeb' },
  { key: 'outro',          label: 'Outro',           color: '#64748b', bg: '#f8fafc' },
]

const FORMATOS = [
  { key: 'presencial', label: 'Presencial', icon: '📍' },
  { key: 'online',     label: 'Online',     icon: '💻' },
]

const ESTADOS_ATA = [
  { key: 'na',             label: 'Nao Aplicável',  color: '#64748b', bg: '#f1f5f9' },
  { key: 'pendente',       label: 'Pendente',       color: '#64748b', bg: '#f1f5f9' },
  { key: 'pronta',         label: 'Pronta',          color: '#16a34a', bg: '#dcfce7' },
  { key: 'em_assinaturas', label: 'Em assinaturas',  color: '#d97706', bg: '#fef3c7' },
  { key: 'assinada',       label: 'Assinada',         color: '#2563eb', bg: '#eff6ff' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const cfgTipoEvento  = k => TIPOS_EVENTO.find(t => t.key === k)  || TIPOS_EVENTO[0]
const cfgTipoReuniao = k => TIPOS_REUNIAO.find(t => t.key === k) || TIPOS_REUNIAO[4]
const cfgFormato     = k => FORMATOS.find(f => f.key === k)      || FORMATOS[0]
const cfgAta         = k => ESTADOS_ATA.find(s => s.key === k)   || ESTADOS_ATA[0]

function formatDataCurta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
}
function formatHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}
function mesLabel(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
}
function diasAte(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24))
}
function isoParaInputDatetime(iso) {
  if (!iso) return ''
  const d   = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <span style={{
      background: bg, color, borderRadius: '0.3rem',
      padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
    >
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Formulário ────────────────────────────────────────────────────────────────
const FORM_VAZIO = {
  tipo: 'reuniao',
  tipo_reuniao: 'ago',
  condominio_id: '',
  condominio_texto: '',
  localidade: '',
  loja_id: '',
  filial_texto: '',
  data_hora: '',
  formato: 'presencial',
  local_evento: '',
  gestor: '',
  estado_ata: 'pendente',
  comentarios: '',
}

function FormEvento({ inicial, lojas, onGuardar, onCancelar, loading }) {
  const [form, setForm] = useState(inicial || FORM_VAZIO)
  // condominio seleccionado: { id, n_impar, nome } | null
  const [condominio, setCondominio] = useState(
    inicial?.condominio_id
      ? { id: inicial.condominio_id, n_impar: inicial.condominio_n_impar, nome: inicial.condominio_nome }
      : null
  )
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const lbl = {
    fontSize: '0.72rem', fontWeight: 600, color: C.muted,
    marginBottom: '0.3rem', display: 'block',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const inp = {
    width: '100%', padding: '0.5rem 0.75rem',
    border: `1px solid ${C.border}`, borderRadius: '0.5rem',
    fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
    color: C.text, background: C.white, boxSizing: 'border-box',
  }
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }

  return (
    <div>
      {/* Tipo de evento */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>Tipo de evento</label>
        <select style={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
          {TIPOS_EVENTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {/* Sub-tipo reunião (só quando tipo = reuniao) */}
      {form.tipo === 'reuniao' && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Tipo de reunião</label>
          <select style={inp} value={form.tipo_reuniao} onChange={e => set('tipo_reuniao', e.target.value)}>
            {TIPOS_REUNIAO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      )}

      {/* Condomínio */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>Condomínio <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
        <CondominioSearch
          value={condominio}
          onChange={c => {
            setCondominio(c)
            set('condominio_id',    c?.id      || '')
            set('condominio_texto', c?.nome    || form.condominio_texto)
          }}
        />
        {/* Texto livre — só visível se não houver condomínio seleccionado */}
        {!condominio && (
          <input
            style={{ ...inp, marginTop: '0.5rem' }}
            placeholder="Ou escreve o nome/morada livremente"
            value={form.condominio_texto}
            onChange={e => set('condominio_texto', e.target.value)}
          />
        )}
      </div>

      {/* Localidade + Loja */}
      <div style={row2}>
        <div>
          <label style={lbl}>Localidade</label>
          <input style={inp} value={form.localidade} onChange={e => set('localidade', e.target.value)} placeholder="Ex: Lisboa" />
        </div>
        <div>
          <label style={lbl}>Loja / Filial</label>
          <select value={form.loja_id} onChange={e => { set('loja_id', e.target.value); set('filial_texto', '') }} style={inp}>
            <option value="">— Seleccionar —</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {!form.loja_id && (
            <input
              style={{ ...inp, marginTop: '0.5rem' }}
              placeholder="Filial (texto livre)"
              value={form.filial_texto}
              onChange={e => set('filial_texto', e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Data + Gestor */}
      <div style={row2}>
        <div>
          <label style={lbl}>Data e Hora *</label>
          <input type="datetime-local" style={inp} value={form.data_hora} onChange={e => set('data_hora', e.target.value)} required />
        </div>
        <div>
          <label style={lbl}>Gestor</label>
          <input style={inp} value={form.gestor} onChange={e => set('gestor', e.target.value)} placeholder="Nome do gestor" />
        </div>
      </div>

      {/* Formato + local */}
      <div style={row2}>
        <div>
          <label style={lbl}>Formato</label>
          <select style={inp} value={form.formato} onChange={e => set('formato', e.target.value)}>
            {FORMATOS.map(f => <option key={f.key} value={f.key}>{f.icon} {f.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{form.formato === 'online' ? 'Link (Zoom/Teams/Meet)' : 'Morada do evento'}</label>
          <input
            style={inp}
            value={form.local_evento}
            onChange={e => set('local_evento', e.target.value)}
            placeholder={form.formato === 'online' ? 'https://zoom.us/j/...' : 'Morada completa'}
          />
        </div>
      </div>

      {/* Estado ata (só para reuniões) */}
      {form.tipo === 'reuniao' && (
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Estado da ata</label>
          <select style={inp} value={form.estado_ata} onChange={e => set('estado_ata', e.target.value)}>
            {ESTADOS_ATA.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      )}

      {/* Comentários */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={lbl}>Comentários</label>
        <textarea
          style={{ ...inp, resize: 'vertical', minHeight: '4rem' }}
          value={form.comentarios}
          onChange={e => set('comentarios', e.target.value)}
          placeholder="Notas livres..."
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button onClick={onCancelar} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
          padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer',
          color: C.muted, fontFamily: 'DM Sans, sans-serif',
        }}>Cancelar</button>
        <button
          onClick={() => onGuardar(form)}
          disabled={!form.data_hora || loading}
          style={{
            background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
            padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            opacity: (!form.data_hora || loading) ? 0.6 : 1,
          }}
        >{loading ? 'A guardar…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

// ── Linha da tabela ───────────────────────────────────────────────────────────
const tdS = { padding: '0.6rem 0.75rem', color: C.text, verticalAlign: 'middle' }
const btnAcao = color => ({
  background: 'none', border: `1px solid ${color}`, borderRadius: '0.35rem',
  padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', color,
  fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
})

function LinhaEvento({ e, onEditar, onApagar }) {
  const dias    = diasAte(e.data_hora)
  const passou  = dias !== null && dias < 0
  const tipoEv  = cfgTipoEvento(e.tipo)
  const tipoReu = e.tipo === 'reuniao' && e.tipo_reuniao ? cfgTipoReuniao(e.tipo_reuniao) : null
  const fmt     = cfgFormato(e.formato)
  const ata     = cfgAta(e.estado_ata)

  return (
    <tr style={{ borderBottom: `1px solid ${C.borderL}`, opacity: passou ? 0.6 : 1 }}>

      {/* Data */}
      <td style={{ ...tdS, minWidth: 80 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
          {formatDataCurta(e.data_hora)}
        </div>
        <div style={{ fontSize: '0.75rem', color: C.muted }}>{formatHora(e.data_hora)}</div>
        {!passou && dias !== null && dias <= 7 && (
          <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>
            {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `${dias}d`}
          </div>
        )}
      </td>

      {/* Tipo */}
      <td style={tdS}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <Badge label={tipoEv.label} color={tipoEv.color} bg={tipoEv.bg} />
          {tipoReu && <Badge label={tipoReu.label} color={tipoReu.color} bg={tipoReu.bg} />}
        </div>
      </td>

      {/* Condomínio */}
      <td style={{ ...tdS, maxWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.condominio_nome || e.condominio_texto || <span style={{ color: C.subtle }}>—</span>}
        </div>
        {e.localidade && <div style={{ fontSize: '0.72rem', color: C.muted }}>{e.localidade}</div>}
      </td>

      {/* Loja */}
      <td style={{ ...tdS, fontSize: '0.78rem', color: C.muted, whiteSpace: 'nowrap' }}>
        {e.loja_nome || e.filial_texto || '—'}
      </td>

      {/* Gestor */}
      <td style={{ ...tdS, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
        {e.gestor || <span style={{ color: C.subtle }}>—</span>}
      </td>

      {/* Formato + local */}
      <td style={{ ...tdS, maxWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
          <span>{fmt.icon}</span>
          {e.local_evento
            ? e.formato === 'online'
              ? <a href={e.local_evento} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '0.72rem' }}>Link</a>
              : <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120, display: 'inline-block' }} title={e.local_evento}>{e.local_evento}</span>
            : <span style={{ color: C.subtle }}>—</span>
          }
        </div>
      </td>

      {/* Estado ata (só reuniões) */}
      <td style={tdS}>
        {e.tipo === 'reuniao'
          ? <Badge label={ata.label} color={ata.color} bg={ata.bg} />
          : <span style={{ color: C.subtle, fontSize: '0.75rem' }}>—</span>
        }
      </td>

      {/* Comentários */}
      <td style={{ ...tdS, maxWidth: 200 }}>
        {e.comentarios
          ? <span style={{ fontSize: '0.75rem', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 200 }} title={e.comentarios}>{e.comentarios}</span>
          : <span style={{ color: C.subtle }}>—</span>
        }
      </td>

      {/* Acções */}
      <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button onClick={() => onEditar(e)} style={btnAcao(C.navy)}>Editar</button>
        <button onClick={() => onApagar(e)} style={{ ...btnAcao('#dc2626'), marginLeft: '0.5rem' }}>Apagar</button>
      </td>
    </tr>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Eventos() {
  const [eventos,     setEventos]     = useState([])
  const [lojas,       setLojas]       = useState([])
  const [gestores,    setGestores]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState(null)

  // Filtros
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroGestor, setFiltroGestor] = useState('')
  const [filtroLoja,   setFiltroLoja]   = useState('')
  const [filtroMes,    setFiltroMes]    = useState('')
  const [filtroAta,    setFiltroAta]    = useState('')

  // Modal
  const [modal,          setModal]          = useState(null)
  const [eventoEditar,   setEventoEditar]   = useState(null)
  const [loadingGuardar, setLoadingGuardar] = useState(false)
  const [apagarId,       setApagarId]       = useState(null)

  // ── Dados base ────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/lojas').then(r => r.lojas || []),
      api.get('/eventos/gestores').then(r => r.gestores || []),
    ]).then(([l, g]) => { setLojas(l); setGestores(g) })
  }, [])

  // ── Carregar eventos ──────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const p = new URLSearchParams()
      if (filtroTipo)   p.set('tipo',       filtroTipo)
      if (filtroGestor) p.set('gestor',     filtroGestor)
      if (filtroLoja)   p.set('loja_id',    filtroLoja)
      if (filtroMes)    p.set('mes',        filtroMes)
      if (filtroAta)    p.set('estado_ata', filtroAta)
      const data = await api.get(`/eventos?${p}`)
      setEventos(data.eventos || [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [filtroTipo, filtroGestor, filtroLoja, filtroMes, filtroAta])

  useEffect(() => { carregar() }, [carregar])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function handleCriar(form) {
    setLoadingGuardar(true)
    try {
      await api.post('/eventos', { ...form, data_hora: new Date(form.data_hora).toISOString() })
      setModal(null)
      carregar()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoadingGuardar(false) }
  }

  async function handleEditar(form) {
    setLoadingGuardar(true)
    try {
      await api.put(`/eventos/${eventoEditar.id}`, { ...form, data_hora: new Date(form.data_hora).toISOString() })
      setModal(null); setEventoEditar(null)
      carregar()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoadingGuardar(false) }
  }

  async function handleApagar() {
    try {
      await api.del(`/eventos/${apagarId}`)
      setApagarId(null); carregar()
    } catch (e) { alert('Erro: ' + e.message) }
  }

  // ── Agrupar por mês ───────────────────────────────────────────────────────
  const grupos = []
  let mesAtual = null
  for (const e of eventos) {
    const m = e.data_hora?.slice(0, 7) || 'sem-data'
    if (m !== mesAtual) { mesAtual = m; grupos.push({ mes: m, label: mesLabel(e.data_hora), rows: [] }) }
    grupos[grupos.length - 1].rows.push(e)
  }

  const mesesDisponiveis = [...new Set(eventos.map(e => e.data_hora?.slice(0, 7)).filter(Boolean))].sort()
  const temFiltro = filtroTipo || filtroGestor || filtroLoja || filtroMes || filtroAta

  const inpStyle = {
    padding: '0.4rem 0.75rem', border: `1px solid ${C.border}`,
    borderRadius: '0.5rem', fontSize: '0.82rem',
    fontFamily: 'DM Sans, sans-serif', color: C.text, background: C.white,
  }
  const thS = {
    padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600,
    fontSize: '0.72rem', color: C.subtle, letterSpacing: '0.04em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    borderBottom: `1.5px solid ${C.border}`, background: '#f7f9fc',
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'DM Sans, sans-serif', background: C.bg, minHeight: '100vh' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: C.navy }}>Agenda</h1>
          <p style={{ margin: '0.25rem 0 0', color: C.muted, fontSize: '0.82rem' }}>
            {loading ? '…' : `${eventos.length} evento(s) encontrado(s)`}
          </p>
        </div>
        <button onClick={() => { setModal('criar'); setEventoEditar(null) }} style={{
          background: C.navy, color: C.white, border: 'none', borderRadius: '0.6rem',
          padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}>+ Novo Evento</button>
      </div>

      {/* Filtros */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={inpStyle}>
          <option value="">Todos os tipos</option>
          {TIPOS_EVENTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={filtroGestor} onChange={e => setFiltroGestor(e.target.value)} style={inpStyle}>
          <option value="">Todos os gestores</option>
          {gestores.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)} style={inpStyle}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={inpStyle}>
          <option value="">Todos os meses</option>
          {mesesDisponiveis.map(m => {
            const label = new Date(m + '-01').toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
            return <option key={m} value={m}>{label}</option>
          })}
        </select>
        <select value={filtroAta} onChange={e => setFiltroAta(e.target.value)} style={inpStyle}>
          <option value="">Todos os estados de ata</option>
          {ESTADOS_ATA.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {temFiltro && (
          <button
            onClick={() => { setFiltroTipo(''); setFiltroGestor(''); setFiltroLoja(''); setFiltroMes(''); setFiltroAta('') }}
            style={{ ...inpStyle, cursor: 'pointer', color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2', fontWeight: 600 }}
          >✕ Limpar</button>
        )}
      </div>

      {/* Tabela */}
      {erro ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1.25rem', color: '#dc2626' }}>
          Erro ao carregar: {erro}
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.subtle }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>A carregar…
        </div>
      ) : eventos.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
          Nenhum evento encontrado para os filtros seleccionados.
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={thS}>Data / Hora</th>
                  <th style={thS}>Tipo</th>
                  <th style={thS}>Condomínio</th>
                  <th style={thS}>Loja</th>
                  <th style={thS}>Gestor</th>
                  <th style={thS}>Formato</th>
                  <th style={thS}>Ata</th>
                  <th style={thS}>Comentários</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Acções</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => (
                  <>
                    <tr key={`mes-${g.mes}`}>
                      <td colSpan={9} style={{
                        padding: '0.5rem 0.75rem', background: '#f0f3f7',
                        fontSize: '0.72rem', fontWeight: 800, color: C.muted,
                        textTransform: 'uppercase', letterSpacing: '0.1em',
                        borderBottom: `1px solid ${C.border}`,
                      }}>
                        {g.label} — {g.rows.length} evento(s)
                      </td>
                    </tr>
                    {g.rows.map(e => (
                      <LinhaEvento
                        key={e.id}
                        e={e}
                        onEditar={e => { setEventoEditar(e); setModal('editar') }}
                        onApagar={e => setApagarId(e.id)}
                      />
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Criar */}
      {modal === 'criar' && (
        <Modal title="Novo Evento" onClose={() => setModal(null)}>
          <FormEvento lojas={lojas} onGuardar={handleCriar} onCancelar={() => setModal(null)} loading={loadingGuardar} />
        </Modal>
      )}

      {/* Modal Editar */}
      {modal === 'editar' && eventoEditar && (
        <Modal title="Editar Evento" onClose={() => { setModal(null); setEventoEditar(null) }}>
          <FormEvento
            inicial={{
              tipo:                 eventoEditar.tipo             || 'reuniao',
              tipo_reuniao:         eventoEditar.tipo_reuniao     || 'ago',
              condominio_id:        eventoEditar.condominio_id    || '',
              condominio_n_impar:   eventoEditar.condominio_n_impar || '',
              condominio_nome:      eventoEditar.condominio_nome  || '',
              condominio_texto:     eventoEditar.condominio_texto || '',
              localidade:           eventoEditar.localidade       || '',
              loja_id:              eventoEditar.loja_id          || '',
              filial_texto:         eventoEditar.filial_texto     || '',
              data_hora:            isoParaInputDatetime(eventoEditar.data_hora),
              formato:              eventoEditar.formato          || 'presencial',
              local_evento:         eventoEditar.local_evento     || '',
              gestor:               eventoEditar.gestor           || '',
              estado_ata:           eventoEditar.estado_ata       || 'pendente',
              comentarios:          eventoEditar.comentarios      || '',
            }}
            lojas={lojas}
            onGuardar={handleEditar}
            onCancelar={() => { setModal(null); setEventoEditar(null) }}
            loading={loadingGuardar}
          />
        </Modal>
      )}

      {/* Confirmação apagar */}
      {apagarId && (
        <Modal title="Confirmar eliminação" onClose={() => setApagarId(null)}>
          <p style={{ color: C.text, marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            Tens a certeza que queres apagar este evento? Esta acção não pode ser desfeita.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button onClick={() => setApagarId(null)} style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem', cursor: 'pointer', color: C.muted, fontFamily: 'DM Sans, sans-serif',
            }}>Cancelar</button>
            <button onClick={handleApagar} style={{
              background: '#dc2626', color: C.white, border: 'none', borderRadius: '0.5rem',
              padding: '0.5rem 1.25rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}>Apagar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
