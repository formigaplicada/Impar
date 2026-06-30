import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import CondominioSearch from './CondominioSearch'

// ── Paleta Ímpar ──────────────────────────────────────────────────────────────
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
  blue:    '#2563eb',
  blueL:   '#eff6ff',
  green:   '#16a34a',
  greenL:  '#f0fdf4',
  amber:   '#d97706',
  amberL:  '#fffbeb',
  red:     '#dc2626',
  redL:    '#fef2f2',
}

const ROLES = [
  { value: 'admin',             label: 'Admin' },
  { value: 'gestor_loja',       label: 'Gestor de Loja' },
  { value: 'gestor_condominio', label: 'Gestor de Condomínio' },
]

const ROLE_BADGE = {
  admin:             { bg: '#fef3c7', color: '#92400e', label: 'Admin' },
  gestor_loja:       { bg: C.blueL,  color: C.blue,    label: 'Gestor Loja' },
  gestor_condominio: { bg: C.greenL, color: C.green,   label: 'Gestor Cond.' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const s = ROLE_BADGE[role] || { bg: C.bg, color: C.muted, label: role }
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: '0.35rem', padding: '0.15rem 0.5rem',
      fontSize: '0.72rem', fontWeight: 600,
    }}>
      {s.label}
    </span>
  )
}

function AtivoBadge({ ativo }) {
  return (
    <span style={{
      background: ativo ? C.greenL : C.redL,
      color: ativo ? C.green : C.red,
      borderRadius: '0.35rem', padding: '0.15rem 0.5rem',
      fontSize: '0.72rem', fontWeight: 600,
    }}>
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ModalUtilizador({ utilizador, lojas, onGuardar, onFechar }) {
  const isNovo = !utilizador

  const [form, setForm] = useState({
    nome:      utilizador?.nome      || '',
    email:     utilizador?.email     || '',
    role:      utilizador?.role      || 'gestor_condominio',
    telemovel: utilizador?.telemovel || '',
    pin:       utilizador?.pin       || '',
    ativo:     utilizador?.ativo     ?? true,
  })

  const [lojasSelect,      setLojasSelect]      = useState(
    (utilizador?.lojas || []).map(l => l.id)
  )
  const [condominiosSelect, setCondominiosSelect] = useState(
    utilizador?.condominios || [] // array de { id, n_impar, nome }
  )
  const [saving, setSaving]   = useState(false)
  const [erro,   setErro]     = useState(null)

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onFechar])

  function toggleLoja(id) {
    setLojasSelect(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function adicionarCondominio(cond) {
    if (!cond) return
    setCondominiosSelect(prev => {
      if (prev.find(c => c.id === cond.id)) return prev
      return [...prev, { id: cond.id, n_impar: cond.n_impar, nome: cond.nome }]
    })
  }

  function removerCondominio(id) {
    setCondominiosSelect(prev => prev.filter(c => c.id !== id))
  }

  async function handleSubmit() {
    setErro(null)
    if (!form.nome.trim())  return setErro('Nome é obrigatório.')
    if (!form.email.trim()) return setErro('Email é obrigatório.')
    if (isNovo && !form.email.endsWith('@impar.pt')) return setErro('Email deve ser @impar.pt.')

    setSaving(true)
    try {
      let id = utilizador?.id

      if (isNovo) {
        const res = await api.post('/admin/users', form)
        if (res.error) { setErro(res.error); setSaving(false); return }
        id = res.id
      } else {
        const res = await api.put(`/admin/users/${id}`, form)
        if (res.error) { setErro(res.error); setSaving(false); return }
      }

      // Associações
      const [resLojas, resConds] = await Promise.all([
        api.put(`/admin/users/${id}/lojas`,      { lojas: lojasSelect }),
        api.put(`/admin/users/${id}/condominios`, { condominios: condominiosSelect.map(c => c.id) }),
      ])

      if (resLojas.error)  { setErro(resLojas.error);  setSaving(false); return }
      if (resConds.error)  { setErro(resConds.error);  setSaving(false); return }

      onGuardar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = {
    width: '100%', padding: '0.5rem 0.75rem',
    border: `1.5px solid ${C.border}`, borderRadius: '0.5rem',
    fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
    color: C.text, background: C.white, boxSizing: 'border-box',
    outline: 'none',
  }

  const label = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: C.muted, marginBottom: '0.35rem', letterSpacing: '0.02em',
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(1,22,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: '1rem',
      }}
    >
      <div style={{
        background: C.white, borderRadius: '1rem',
        width: '100%', maxWidth: 580,
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '90vh',
      }}>
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            {isNovo ? 'Novo utilizador' : 'Editar utilizador'}
          </h3>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Corpo */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* Nome */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>Nome</label>
              <input style={inp} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" />
            </div>

            {/* Email */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>Email</label>
              <input
                style={{ ...inp, background: !isNovo ? C.bg : C.white }}
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="utilizador@impar.pt"
                readOnly={!isNovo}
              />
              {!isNovo && <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: C.subtle }}>O email não pode ser alterado após criação.</p>}
            </div>

            {/* Role */}
            <div>
              <label style={label}>Role</label>
              <select
                style={{ ...inp, cursor: 'pointer' }}
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* Ativo */}
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                Utilizador ativo
              </label>
            </div>

            {/* Telemovel */}
            <div>
              <label style={label}>Telemóvel</label>
              <input style={inp} value={form.telemovel} onChange={e => setForm(f => ({ ...f, telemovel: e.target.value }))} placeholder="9XXXXXXXX" />
            </div>

            {/* PIN */}
            <div>
              <label style={label}>PIN</label>
              <input style={inp} value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder="4 dígitos" maxLength={4} />
            </div>
          </div>

          {/* Lojas */}
          <div style={{ marginTop: '1.25rem' }}>
            <label style={label}>Lojas</label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
              padding: '0.75rem', background: C.bg,
              border: `1.5px solid ${C.border}`, borderRadius: '0.5rem',
            }}>
              {lojas.map(l => {
                const sel = lojasSelect.includes(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLoja(l.id)}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: '0.4rem',
                      border: sel ? `1.5px solid ${C.navy}` : `1.5px solid ${C.border}`,
                      background: sel ? C.navy : C.white,
                      color: sel ? C.white : C.muted,
                      fontSize: '0.78rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      transition: 'all 0.1s',
                    }}
                  >
                    {l.nome}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Condomínios */}
          <div style={{ marginTop: '1.25rem' }}>
            <label style={label}>Condomínios</label>

            {/* Lista dos já adicionados */}
            {condominiosSelect.length > 0 && (
              <div style={{
                marginBottom: '0.625rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
              }}>
                {condominiosSelect.map(c => (
                  <span key={c.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    background: C.blueL, border: `1px solid #bfdbfe`,
                    borderRadius: '0.4rem', padding: '0.2rem 0.5rem',
                    fontSize: '0.78rem', color: C.blue, fontWeight: 600,
                  }}>
                    {c.n_impar} <span style={{ fontWeight: 400, color: C.muted }}>{c.nome}</span>
                    <button
                      type="button"
                      onClick={() => removerCondominio(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.9rem', padding: '0 0.1rem', lineHeight: 1 }}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Search para adicionar */}
            <CondominioSearch
              value={null}
              onChange={adicionarCondominio}
              placeholder="Pesquisar e adicionar condomínio…"
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: C.subtle }}>
              Pesquisa e clica para adicionar. Remove com ✕.
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: C.redL, border: `1px solid #fca5a5`, borderRadius: '0.5rem', fontSize: '0.82rem', color: C.red }}>
              {erro}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div style={{
          padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onFechar}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
              border: `1.5px solid ${C.border}`, background: C.white,
              color: C.muted, fontSize: '0.875rem', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >Cancelar</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.5rem',
              border: 'none', background: saving ? C.border : C.navy,
              color: saving ? C.muted : C.white,
              fontSize: '0.875rem', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >{saving ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de confirmação de desativação ───────────────────────────────────────

function ModalConfirmar({ utilizador, onConfirmar, onFechar }) {
  const [loading, setLoading] = useState(false)

  async function handleConfirmar() {
    setLoading(true)
    await onConfirmar()
    setLoading(false)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(1,22,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200, padding: '1rem',
      }}
    >
      <div style={{
        background: C.white, borderRadius: '1rem',
        width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
        padding: '1.75rem',
      }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
          Desativar utilizador
        </h3>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: C.muted, lineHeight: 1.5 }}>
          Tens a certeza que queres desativar <strong>{utilizador.nome}</strong>? O utilizador deixará de conseguir aceder ao sistema, mas os seus dados são mantidos.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            onClick={onFechar}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '0.5rem',
              border: `1.5px solid ${C.border}`, background: C.white,
              color: C.muted, fontSize: '0.875rem', cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >Cancelar</button>
          <button
            onClick={handleConfirmar}
            disabled={loading}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.5rem',
              border: 'none', background: loading ? C.border : C.red,
              color: loading ? C.muted : C.white,
              fontSize: '0.875rem', fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >{loading ? 'A desativar…' : 'Desativar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── O meu perfil (não-admin) ──────────────────────────────────────────────────

function MeuPerfil() {
  const [dados,   setDados]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({ nome: '', telemovel: '', pin: '' })
  const [saving,  setSaving]  = useState(false)
  const [erro,    setErro]    = useState(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const res = await api.get('/me')
      const u = res?.user || null
      setDados(u)
      if (u) {
        setForm({ nome: u.nome || '', telemovel: u.telemovel || '', pin: u.pin || '' })
      }
      setLoading(false)
    }
    carregar()
  }, [])

  async function handleGuardar() {
    setErro(null)
    setSucesso(false)
    if (!form.nome.trim()) return setErro('Nome é obrigatório.')
    if (form.pin && !/^\d{4}$/.test(form.pin)) return setErro('PIN deve ter 4 dígitos.')

    setSaving(true)
    try {
      const res = await api.put('/me', form)
      if (res.error) { setErro(res.error); setSaving(false); return }
      setDados(res.user)
      setSucesso(true)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = {
    width: '100%', padding: '0.5rem 0.75rem',
    border: `1.5px solid ${C.border}`, borderRadius: '0.5rem',
    fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
    color: C.text, background: C.white, boxSizing: 'border-box',
    outline: 'none',
  }

  const label = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: C.muted, marginBottom: '0.35rem', letterSpacing: '0.02em',
  }

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
        <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</span>
        A carregar perfil…
      </div>
    )
  }

  if (!dados) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
        Não foi possível carregar o perfil.
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
          O meu perfil
        </h2>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: C.subtle }}>
          Consulta e edita a tua informação pessoal.
        </p>
      </div>

      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: '0.875rem', padding: '1.5rem',
        maxWidth: 480,
        boxShadow: '0 1px 3px rgba(1,22,64,0.05)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

          {/* Nome */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Nome</label>
            <input
              style={inp}
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Nome completo"
            />
          </div>

          {/* Email (não editável) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Email</label>
            <input style={{ ...inp, background: C.bg }} value={dados.email} readOnly />
          </div>

          {/* Role (não editável) */}
          <div>
            <label style={label}>Role</label>
            <div style={{ ...inp, background: C.bg, display: 'flex', alignItems: 'center' }}>
              <RoleBadge role={dados.role} />
            </div>
          </div>

          {/* Telemóvel */}
          <div>
            <label style={label}>Telemóvel</label>
            <input
              style={inp}
              value={form.telemovel}
              onChange={e => setForm(f => ({ ...f, telemovel: e.target.value }))}
              placeholder="9XXXXXXXX"
            />
          </div>

          {/* PIN */}
          <div>
            <label style={label}>PIN</label>
            <input
              style={inp}
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
              placeholder="4 dígitos"
              maxLength={4}
            />
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: C.redL, border: `1px solid #fca5a5`, borderRadius: '0.5rem', fontSize: '0.82rem', color: C.red }}>
            {erro}
          </div>
        )}

        {/* Sucesso */}
        {sucesso && !erro && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: C.greenL, border: `1px solid #bbf7d0`, borderRadius: '0.5rem', fontSize: '0.82rem', color: C.green }}>
            Perfil atualizado com sucesso.
          </div>
        )}

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={saving}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.5rem',
              border: 'none', background: saving ? C.border : C.navy,
              color: saving ? C.muted : C.white,
              fontSize: '0.875rem', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >{saving ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Utilizadores({ currentUser }) {
  const [utilizadores, setUtilizadores] = useState([])
  const [lojas,        setLojas]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filtro,       setFiltro]       = useState('')
  const [filtroRole,   setFiltroRole]   = useState('')

  const [modalEditar,    setModalEditar]    = useState(null)  // utilizador obj ou 'novo'
  const [modalConfirmar, setModalConfirmar] = useState(null)  // utilizador obj

  const isAdmin = currentUser?.role === 'admin'

  async function carregar() {
    setLoading(true)
    const [resUsers, resLojas] = await Promise.all([
      api.get('/admin/users'),
      api.get('/lojas'),
    ])
    setUtilizadores(Array.isArray(resUsers) ? resUsers : [])
    setLojas(resLojas?.lojas || [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) carregar() }, [isAdmin])

  async function handleDesativar() {
    const res = await api.delete(`/admin/users/${modalConfirmar.id}`)
    if (!res.error) {
      setModalConfirmar(null)
      carregar()
    }
  }

  async function handleReativar(u) {
    await api.put(`/admin/users/${u.id}`, { ativo: true })
    carregar()
  }

  const utilizadoresFiltrados = utilizadores.filter(u => {
    const q = filtro.toLowerCase()
    const matchTexto = !q || u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole  = !filtroRole || u.role === filtroRole
    return matchTexto && matchRole
  })

  const thSt = {
    padding: '0.625rem 1rem', fontWeight: 600, fontSize: '0.72rem',
    color: C.muted, letterSpacing: '0.04em', textAlign: 'left',
    whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}`,
    background: '#f7f9fc',
  }

  const tdSt = {
    padding: '0.75rem 1rem', fontSize: '0.82rem', color: C.text,
    borderBottom: `1px solid ${C.borderL}`, verticalAlign: 'middle',
  }

  if (!isAdmin) {
    return <MeuPerfil />
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
            Utilizadores
          </h2>
          {!loading && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: C.subtle }}>
              {utilizadores.length} utilizador{utilizadores.length !== 1 ? 'es' : ''}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filtro role */}
          <select
            value={filtroRole}
            onChange={e => setFiltroRole(e.target.value)}
            style={{
              padding: '0.45rem 0.75rem', border: `1.5px solid ${C.border}`,
              borderRadius: '0.5rem', fontSize: '0.82rem',
              fontFamily: 'DM Sans, sans-serif', color: C.text,
              background: C.white, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">Todos os roles</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          {/* Filtro texto */}
          <input
            type="text"
            placeholder="Filtrar por nome ou email…"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{
              padding: '0.45rem 0.875rem', border: `1.5px solid ${C.border}`,
              borderRadius: '0.5rem', fontSize: '0.875rem',
              fontFamily: 'DM Sans, sans-serif', color: C.text,
              background: C.white, width: '220px', outline: 'none',
            }}
          />

          {/* Botão novo */}
          {isAdmin && (
            <button
              onClick={() => setModalEditar('novo')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                background: C.navy, color: C.white, border: 'none',
                borderRadius: '0.5rem', padding: '0.5rem 1.125rem',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              + Novo utilizador
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
          <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</span>
          A carregar utilizadores…
        </div>
      ) : utilizadoresFiltrados.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
          {filtro || filtroRole ? 'Nenhum utilizador encontrado.' : 'Sem utilizadores.'}
        </div>
      ) : (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: '0.875rem', overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(1,22,64,0.05)',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thSt}>Nome</th>
                  <th style={thSt}>Email</th>
                  <th style={thSt}>Role</th>
                  <th style={thSt}>Lojas</th>
                  <th style={thSt}>Condomínios</th>
                  <th style={thSt}>Último login</th>
                  <th style={thSt}>Estado</th>
                  {isAdmin && <th style={{ ...thSt, textAlign: 'center' }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {utilizadoresFiltrados.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ background: i % 2 === 0 ? C.white : '#fafbfc' }}
                  >
                    <td style={{ ...tdSt, fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ ...tdSt, color: C.muted }}>{u.email}</td>
                    <td style={tdSt}><RoleBadge role={u.role} /></td>
                    <td style={tdSt}>
                      {u.lojas?.length > 0
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {u.lojas.map(l => (
                              <span key={l.id} style={{
                                background: C.bg, color: C.muted, borderRadius: '0.3rem',
                                padding: '0.1rem 0.4rem', fontSize: '0.72rem', fontWeight: 600,
                              }}>{l.nome}</span>
                            ))}
                          </div>
                        : <span style={{ color: C.subtle, fontSize: '0.78rem' }}>—</span>
                      }
                    </td>
                    <td style={tdSt}>
                      {u.condominios?.length > 0
                        ? <span style={{ fontSize: '0.78rem', color: C.muted, fontWeight: 600 }}>
                            {u.condominios.length} condomínio{u.condominios.length !== 1 ? 's' : ''}
                          </span>
                        : <span style={{ color: C.subtle, fontSize: '0.78rem' }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdSt, color: C.subtle }}>{formatDate(u.ultimo_login)}</td>
                    <td style={tdSt}><AtivoBadge ativo={u.ativo} /></td>
                    {isAdmin && (
                      <td style={{ ...tdSt, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
                        <button
                          onClick={() => setModalEditar(u)}
                          style={{
                            background: C.blueL, color: C.blue, border: 'none',
                            borderRadius: '0.375rem', padding: '0.3rem 0.625rem',
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'DM Sans, sans-serif', marginRight: '0.375rem',
                          }}
                        >Editar</button>
                        {u.ativo ? (
                          <button
                            onClick={() => setModalConfirmar(u)}
                            style={{
                              background: C.redL, color: C.red, border: 'none',
                              borderRadius: '0.375rem', padding: '0.3rem 0.625rem',
                              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'DM Sans, sans-serif',
                            }}
                          >Desativar</button>
                        ) : (
                          <button
                            onClick={() => handleReativar(u)}
                            style={{
                              background: C.greenL, color: C.green, border: 'none',
                              borderRadius: '0.375rem', padding: '0.3rem 0.625rem',
                              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'DM Sans, sans-serif',
                            }}
                          >Reativar</button>
                        )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal editar/criar */}
      {modalEditar && (
        <ModalUtilizador
          utilizador={modalEditar === 'novo' ? null : modalEditar}
          lojas={lojas}
          onGuardar={() => { setModalEditar(null); carregar() }}
          onFechar={() => setModalEditar(null)}
        />
      )}

      {/* Modal confirmar desativação */}
      {modalConfirmar && (
        <ModalConfirmar
          utilizador={modalConfirmar}
          onConfirmar={handleDesativar}
          onFechar={() => setModalConfirmar(null)}
        />
      )}
    </div>
  )
}