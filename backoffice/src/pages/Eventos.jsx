import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import CondominioSearch from '../components/CondominioSearch'

const C = {
  navy:    '#011640',
  white:   '#ffffff',
  bg:      '#f4f6f9',
  surface: '#ffffff',
  border:  '#e4e8ef',
  borderL: '#f0f3f7',
  text:    '#0f1d2e',
  muted:   '#6b7a90',
  subtle:  '#9aa3b0',
}

const FORMATOS = [
  { key: 'presencial', label: 'Presencial', icon: '📍' },
  { key: 'online',     label: 'Online',     icon: '💻' },
  { key: 'misto',      label: 'Misto',      icon: '🔀' },
]

const ESTADOS = [
  { key: 'agendada',   label: 'Agendada',   color: '#2563eb', bg: '#eff6ff' },
  { key: 'realizada',  label: 'Realizada',  color: '#16a34a', bg: '#dcfce7' },
  { key: 'adiada',     label: 'Adiada',     color: '#d97706', bg: '#fef3c7' },
  { key: 'cancelada',  label: 'Cancelada',  color: '#dc2626', bg: '#fef2f2' },
]

const cfgFormato = k => FORMATOS.find(f => f.key === k) || FORMATOS[0]
const cfgEstado  = k => ESTADOS.find(s => s.key === k)  || ESTADOS[0]

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
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const data = new Date(iso); data.setHours(0, 0, 0, 0)
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24))
}
function isoParaInputDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      background: bg, color, borderRadius: '0.3rem',
      padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}


function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem',
    }}>
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

const FORM_VAZIO = {
  tipo: 'reuniao',
  condominio_id: '',
  condominio_texto: '',
  localidade: '',
  loja_id: '',
  filial_texto: '',
  data_hora: '',
  formato: 'presencial',
  local_evento: '',
  gestor: '',
  gestor_id: '',
  estado: 'agendada',
  comentarios: '',
}

function FormEvento({ inicial, lojas, utilizadores, onGuardar, onCancelar, loading }) {
  const [form, setForm] = useState(inicial || FORM_VAZIO)
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
      {/* Condomínio */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>Condomínio <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
        <CondominioSearch
          value={condominio}
          onChange={c => {
            setCondominio(c)
            if (!c) { set('condominio_id', ''); return }
            set('condominio_id',    c.id)
            set('condominio_texto', c.nome)
            if (c.codigo_postal) {
              const partes = c.codigo_postal.trim().split(/\s+/)
              if (partes.length > 1) set('localidade', partes.slice(1).join(' '))
            }
            if (c.loja_id) set('loja_id', String(c.loja_id))
            if (c.gestor) {
              const match = utilizadores.find(u => u.nome.toLowerCase() === c.gestor.toLowerCase())
              set('gestor', match ? match.nome : c.gestor)
            }
          }}
        />
        {!condominio && (
          <input
            style={{ ...inp, marginTop: '0.5rem' }}
            placeholder="Ou escreve o nome livremente"
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
            <select
              style={inp}
              value={form.gestor_id || form.gestor}
              onChange={e => {
                const u = utilizadores.find(u => u.id === e.target.value)
                if (u) {
                  set('gestor',    u.nome)
                  set('gestor_id', u.id)
                } else {
                  set('gestor',    '')
                  set('gestor_id', '')
                }
              }}
            >
              <option value="">— Seleccionar —</option>
              {utilizadores.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              <option value="__outro__">Outro (texto livre)</option>
            </select>
          {!form.gestor && (
            <input
              style={{ ...inp, marginTop: '0.5rem' }}
              placeholder="Nome do gestor"
              value={form.gestor}
              onChange={e => set('gestor', e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Formato + Local */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>Formato</label>
        <select style={inp} value={form.formato} onChange={e => set('formato', e.target.value)}>
          {FORMATOS.map(f => <option key={f.key} value={f.key}>{f.icon} {f.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>{form.formato === 'online' ? 'Link (Zoom/Teams/Meet)' : 'Morada do evento'}</label>
        <input
          style={inp}
          value={form.local_evento}
          onChange={e => set('local_evento', e.target.value)}
          placeholder={form.formato === 'online' ? 'https://zoom.us/j/...' : 'Morada completa'}
        />
      </div>

      {/* Estado */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={lbl}>Estado</label>
        <select style={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
          {ESTADOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

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
const tdS = { padding: '0.55rem 0.75rem', color: C.text, verticalAlign: 'middle' }
const btnAcao = color => ({
  background: 'none', border: `1px solid ${color}`, borderRadius: '0.35rem',
  padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', color,
  fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
})

function LinhaEvento({ e, onEditar, onApagar }) {
  const dias   = diasAte(e.data_hora)
  const passou = dias !== null && dias < 0
  const estado = cfgEstado(e.estado)

  return (
    <tr style={{ borderBottom: `1px solid ${C.borderL}`, opacity: passou ? 0.6 : 1 }}>

      {/* Data */}
      <td style={{ ...tdS, minWidth: 72 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: C.navy, fontVariantNumeric: 'tabular-nums' }}>
          {formatDataCurta(e.data_hora)}
        </div>
        <div style={{ fontSize: '0.72rem', color: C.muted }}>{formatHora(e.data_hora)}</div>
        {!passou && dias !== null && dias <= 7 && (
          <div style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>
            {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `${dias}d`}
          </div>
        )}
      </td>

      {/* Condomínio */}
      <td style={{ ...tdS, maxWidth: 220 }}>
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

      {/* Estado */}
      <td style={tdS}>
        <Badge label={estado.label} color={estado.color} bg={estado.bg} />
      </td>

 {/* Acções */}
      <td style={{ ...tdS, textAlign: 'right' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
          <button onClick={() => onEditar(e)} style={btnAcao(C.navy)}>Editar</button>
          <button onClick={() => onApagar(e)} style={btnAcao('#dc2626')}>Apagar</button>
        </div>
      </td>
    </tr>
  )
}
 

// ── Componente principal ──────────────────────────────────────────────────────
export default function Eventos() {
  const [eventos,      setEventos]      = useState([])
  const [lojas,        setLojas]        = useState([])
  const [utilizadores, setUtilizadores] = useState([])
  const [gestores,     setGestores]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [erro,         setErro]         = useState(null)

  const [filtroGestor, setFiltroGestor] = useState('')
  const [filtroLoja,   setFiltroLoja]   = useState('')
  const [filtroMes,    setFiltroMes]    = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const [modal,          setModal]          = useState(null)
  const [eventoEditar,   setEventoEditar]   = useState(null)
  const [loadingGuardar, setLoadingGuardar] = useState(false)
  const [apagarId,       setApagarId]       = useState(null)

  useEffect(() => {
    api.post('/eventos/sincronizar-estados', {})
    Promise.all([
      api.get('/lojas').then(r => r.lojas || []),
      api.get('/eventos/gestores').then(r => r.gestores || []),
    ]).then(([l, u]) => { setLojas(l); setUtilizadores(u); setGestores(u.map(u => u.nome)) })
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams()
      if (filtroGestor) p.set('gestor',    filtroGestor)
      if (filtroLoja)   p.set('loja_id',   filtroLoja)
      if (filtroMes)    p.set('mes',       filtroMes)
      if (filtroEstado) p.set('estado',    filtroEstado)
      const data = await api.get(`/eventos?${p}`)
      setEventos(data.eventos || [])
    } catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }, [filtroGestor, filtroLoja, filtroMes, filtroEstado])

  useEffect(() => { carregar() }, [carregar])

  async function handleCriar(form) {
    setLoadingGuardar(true)
    try {
      await api.post('/eventos', { ...form, data_hora: new Date(form.data_hora).toISOString() })
      setModal(null); carregar()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoadingGuardar(false) }
  }

  async function handleEditar(form) {
    setLoadingGuardar(true)
    try {
      await api.put(`/eventos/${eventoEditar.id}`, { ...form, data_hora: new Date(form.data_hora).toISOString() })
      setModal(null); setEventoEditar(null); carregar()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoadingGuardar(false) }
  }

  async function handleApagar() {
    try {
      await api.del(`/eventos/${apagarId}`)
      setApagarId(null); carregar()
    } catch (e) { alert('Erro: ' + e.message) }
  }

  const grupos = []
  let mesAtual = null
  for (const e of eventos) {
    const m = e.data_hora?.slice(0, 7) || 'sem-data'
    if (m !== mesAtual) { mesAtual = m; grupos.push({ mes: m, label: mesLabel(e.data_hora), rows: [] }) }
    grupos[grupos.length - 1].rows.push(e)
  }

  const mesesDisponiveis = [...new Set(eventos.map(e => e.data_hora?.slice(0, 7)).filter(Boolean))].sort()
  const temFiltro = filtroGestor || filtroLoja || filtroMes || filtroEstado

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
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={inpStyle}>
          <option value="">Todos os estados</option>
          {ESTADOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {temFiltro && (
          <button
            onClick={() => { setFiltroGestor(''); setFiltroLoja(''); setFiltroMes(''); setFiltroEstado('') }}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '90px' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '130px' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>Data</th>
                <th style={thS}>Condomínio</th>
                <th style={thS}>Loja</th>
                <th style={thS}>Gestor</th>
                <th style={thS}>Estado</th>
                <th style={{ ...thS, textAlign: 'right' }}>Acções</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <>
                  <tr key={`mes-${g.mes}`}>
                    <td colSpan={6} style={{
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
      )}

      {/* Modal Criar */}
      {modal === 'criar' && (
        <Modal title="Novo Evento" onClose={() => setModal(null)}>
          <FormEvento lojas={lojas} utilizadores={utilizadores} onGuardar={handleCriar} onCancelar={() => setModal(null)} loading={loadingGuardar} />
        </Modal>
      )}

      {/* Modal Editar */}
      {modal === 'editar' && eventoEditar && (
        <Modal title="Editar Evento" onClose={() => { setModal(null); setEventoEditar(null) }}>
          <FormEvento
            inicial={{
              tipo:               eventoEditar.tipo             || 'reuniao',
              condominio_id:      eventoEditar.condominio_id    || '',
              condominio_n_impar: eventoEditar.condominio_n_impar || '',
              condominio_nome:    eventoEditar.condominio_nome  || '',
              condominio_texto:   eventoEditar.condominio_texto || '',
              localidade:         eventoEditar.localidade       || '',
              loja_id:            eventoEditar.loja_id          || '',
              filial_texto:       eventoEditar.filial_texto     || '',
              data_hora:          isoParaInputDatetime(eventoEditar.data_hora),
              formato:            eventoEditar.formato          || 'presencial',
              local_evento:       eventoEditar.local_evento     || '',
              gestor:             eventoEditar.gestor           || '',
              gestor_id:          eventoEditar.gestor_id        || '',
              estado:             eventoEditar.estado           || 'agendada',
              comentarios:        eventoEditar.comentarios      || '',
            }}
            lojas={lojas}
            utilizadores={utilizadores}
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
