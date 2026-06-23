import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import TabContratos from './TabContratos'
import TabCondominos from './TabCondominos'
import SeccaoDebitoDireto from './SeccaoDebitoDireto'
import BotaoFichaCondominio from './FichaCondominioPDF'


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
  blue:    '#2563eb',
  blueL:   '#eff6ff',
}

const CAMPOS_OBRIGATORIOS = ['loja_id', 'nome']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fileIcon(item) {
  if (item.type === 'folder') return '📁'
  const mime = item.mimeType || ''
  const name = item.name.toLowerCase()
  if (mime.includes('pdf') || name.endsWith('.pdf')) return '📄'
  if (mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return '📝'
  if (mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊'
  if (mime.includes('image') || name.match(/\.(jpg|jpeg|png|gif|webp)$/)) return '🖼'
  if (mime.includes('video') || name.match(/\.(mp4|mov|avi)$/)) return '🎬'
  if (mime.includes('zip') || name.endsWith('.zip')) return '🗜'
  return '📎'
}

// ── Modal Novo Condomínio ─────────────────────────────────────────────────────

function Modal({ lojas, onClose, onSave }) {
  const [form, setForm] = useState({
    loja_id: '', nome: '', nipc: '', morada: '', codigo_postal: '',
    telefone: '', telemovel: '', n_fracoes: '', iban: '',
    gestor: '', email_gestor: '', telefone2: ''
  })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.loja_id || !form.nome) { setErro('Loja e Nome são obrigatórios.'); return }
    setLoading(true); setErro('')
    const res = await api.post('/condominios', form)
    if (res?.ok) { onSave(res.n_impar) }
    else { setErro(res?.error || 'Erro ao criar condomínio.'); setLoading(false) }
  }

  const inputField = (label, name, type = 'text', obrigatorio = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>{label}{obrigatorio ? ' *' : ''}</label>
      <input type={type} name={name} value={form[name]} onChange={handleChange} required={obrigatorio}
        style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${obrigatorio && !form[name] ? '#fca5a5' : C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text }} />
    </div>
  )

  const sectionLabel = (t) => (
    <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>{t}</p>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: '1rem', width: '100%', maxWidth: '36rem', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text, margin: 0 }}>Novo Condomínio</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: C.subtle }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>{sectionLabel('Obrigatórios')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Loja *</label>
                  <select name="loja_id" value={form.loja_id} onChange={handleChange} required
                    style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${!form.loja_id ? '#fca5a5' : C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', background: C.white }}>
                    <option value="">Selecionar loja...</option>
                    {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
                {inputField('Nome', 'nome', 'text', true)}
              </div>
            </div>
            <div>{sectionLabel('Identificação')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {inputField('NIPC', 'nipc')}{inputField('Nº Frações', 'n_fracoes', 'number')}{inputField('IBAN', 'iban')}
              </div>
            </div>
            <div>{sectionLabel('Localização')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>{inputField('Morada', 'morada')}</div>
                {inputField('Código Postal', 'codigo_postal')}
              </div>
            </div>
            <div>{sectionLabel('Contactos')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {inputField('Telefone', 'telefone', 'tel')}{inputField('Telemóvel', 'telemovel', 'tel')}{inputField('Telefone 2', 'telefone2', 'tel')}
              </div>
            </div>
            <div>{sectionLabel('Gestor')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {inputField('Nome do Gestor', 'gestor')}{inputField('Email do Gestor', 'email_gestor', 'email')}
              </div>
            </div>
            {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: C.muted, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'A criar...' : 'Criar Condomínio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalEditar({ condominio, lojas, onClose, onSave }) {
  const [form, setForm] = useState({
    nome:          condominio.nome          || '',
    nipc:          condominio.nipc          || '',
    morada:        condominio.morada        || '',
    codigo_postal: condominio.codigo_postal || '',
    telefone:      condominio.telefone      || '',
    telemovel:     condominio.telemovel     || '',
    n_fracoes:     condominio.n_fracoes     || '',
    iban:          condominio.iban          || '',
    gestor:        condominio.gestor        || '',
    email_gestor:  condominio.email_gestor  || '',
    telefone2:     condominio.telefone2     || '',
   })
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState('')
  const [gestores, setGestores] = useState([])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
  if (condominio.loja_id) {
    api.get(`/utilizadores/gestores/${condominio.loja_id}`)
      .then(d => setGestores(d?.utilizadores || []))
  }
}, [condominio.loja_id])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome) { setErro('Nome é obrigatório.'); return }
    setLoading(true); setErro('')
    const res = await api.put(`/condominios/${condominio.id}`, form)
    if (res?.ok) { onSave(res.condominio) }
    else { setErro(res?.error || 'Erro ao guardar.'); setLoading(false) }
  }

  const inputField = (label, name, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>{label}</label>
      <input type={type} name={name} value={form[name]} onChange={handleChange}
        style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text }} />
    </div>
  )

  const sectionLabel = (t) => (
    <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>{t}</p>
  )

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
    >
      <div style={{ background: C.white, borderRadius: '1rem', width: '100%', maxWidth: '36rem', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text, margin: 0 }}>Editar Condomínio</h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: C.subtle }}>{condominio.n_impar} · {condominio.nome}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: C.subtle }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Identificação */}
            <div>
              {sectionLabel('Identificação')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>{inputField('Nome', 'nome')}</div>
                {inputField('NIPC', 'nipc')}
                {inputField('Nº Frações', 'n_fracoes', 'number')}
                {inputField('IBAN', 'iban')}
              </div>
            </div>

            {/* Localização */}
            <div>
              {sectionLabel('Localização')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>{inputField('Morada', 'morada')}</div>
                {inputField('Código Postal', 'codigo_postal')}
              </div>
            </div>

            {/* Contactos */}
            <div>
              {sectionLabel('Contactos')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {inputField('Telefone', 'telefone', 'tel')}
                {inputField('Telemóvel', 'telemovel', 'tel')}
                {inputField('Telefone 2', 'telefone2', 'tel')}
              </div>
            </div>

            {/* Gestor */}
<div>
  {sectionLabel('Gestor')}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Gestor</label>
      <select
        value={form.email_gestor || ''}
        onChange={e => {
          const u = gestores.find(g => g.email === e.target.value)
          setForm(f => ({
            ...f,
            email_gestor: e.target.value,
            gestor: u?.nome || f.gestor,
            telefone2: u?.telemovel || '',
          }))
        }}
        style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text, cursor: 'pointer' }}
      >
        <option value="">— Selecionar gestor —</option>
        {gestores.map((g, i) => {
          const isFirst = i === 0
          const prevTemAcesso = i > 0 && gestores[i-1].tem_acesso_loja
          const separator = !g.tem_acesso_loja && prevTemAcesso
          return (
            <>
              {separator && <option disabled>── Outros gestores ──</option>}
              <option key={g.id} value={g.email}>
                {g.nome}{g.tem_acesso_loja ? ' ★' : ''}
              </option>
            </>
          )
        })}
      </select>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Email</label>
        <input
          type="email"
          value={form.email_gestor || ''}
          onChange={e => setForm(f => ({ ...f, email_gestor: e.target.value }))}
          style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Telefone</label>
        <input
          type="tel"
          value={form.telefone2 || ''}
          onChange={e => setForm(f => ({ ...f, telefone2: e.target.value }))}
          style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text }}
        />
      </div>
    </div>
  </div>
</div>

            {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: C.muted, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Tab Informação ────────────────────────────────────────────────────────────

function TabInfo({ c }) {
  const InfoCard = ({ title, children }) => (
    <div style={{ background: C.surface, borderRadius: '0.75rem', border: `1px solid ${C.border}`, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(1,22,64,0.05)' }}>
      <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.875rem' }}>{title}</h3>
      {children}
    </div>
  )
  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.3rem 0', borderBottom: `1px solid ${C.borderL}`, gap: '1rem' }}>
      <span style={{ fontSize: '0.78rem', color: C.subtle, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: C.text, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
      <InfoCard title="Identificação">
        <Row label="N Impar" value={<strong style={{ color: C.navy }}>{c.n_impar}</strong>} />
        <Row label="Nome" value={c.nome} />
        <Row label="NIPC" value={c.nipc} />
        <Row label="Nº Frações" value={c.n_fracoes} />
        <Row label="Loja" value={c.loja_nome} />
      </InfoCard>
      <InfoCard title="Localização">
        <Row label="Morada" value={c.morada} />
        <Row label="Código Postal" value={c.codigo_postal} />
      </InfoCard>
      <InfoCard title="Contactos">
        <Row label="Telefone" value={c.telefone} />
        <Row label="Telemóvel" value={c.telemovel} />
        <Row label="Telefone 2" value={c.telefone2} />
      </InfoCard>
      <InfoCard title="Gestor">
        <Row label="Nome" value={c.gestor} />
        <Row label="Email" value={c.email_gestor} />
      </InfoCard>
      <div style={{ gridColumn: '1 / -1' }}>
        <InfoCard title="Financeiro">
          <Row label="IBAN" value={c.iban} />
        </InfoCard>
      </div>
      <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
        <BotaoFichaCondominio
          condominioId={c.id}
        />
      </div>
    </div>    
  )
}

// ── Sync Button ───────────────────────────────────────────────────────────────

function SyncButton({ condominioId, onSuccess }) {
  const [syncing, setSyncing] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function handleSync() {
    setSyncing(true)
    setResultado(null)
    const res = await api.post(`/admin/onedrive/sync/${condominioId}`, {})
    setSyncing(false)
    if (res?.ok) {
      setResultado({ ok: true, msg: `Pasta ligada: ${res.folder_name}` })
      setTimeout(() => onSuccess(), 1000)
    } else {
      const msgs = {
        not_found:         'Pasta não encontrada no OneDrive.',
        no_activos_folder: 'Loja sem pasta de activos configurada.',
        api_error:         `Erro API: ${res.error || 'desconhecido'}`,
      }
      setResultado({ ok: false, msg: msgs[res.reason] || 'Erro desconhecido.' })
    }
  }

  return (
    <div>
      <button onClick={handleSync} disabled={syncing} style={{
        background: syncing ? C.border : C.navy, color: syncing ? C.muted : C.white,
        border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
        fontSize: '0.875rem', fontWeight: 600, cursor: syncing ? 'default' : 'pointer',
        fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s'
      }}>
        {syncing ? '⏳ A sincronizar…' : '🔗 Ligar OneDrive'}
      </button>
      {resultado && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: resultado.ok ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
          {resultado.ok ? '✅' : '❌'} {resultado.msg}
        </p>
      )}
    </div>
  )
}

// ── Upload com progresso via XHR ──────────────────────────────────────────────

function uploadComProgresso({ url, formData, token, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) }
      catch { reject(new Error('Resposta inválida do servidor')) }
    }
    xhr.onerror = () => reject(new Error('Erro de rede'))
    xhr.send(formData)
  })
}

// ── Modal Nova Pasta ──────────────────────────────────────────────────────────

function ModalNovaPasta({ condominioId, currentFolderId, onClose, onCreated }) {
  const [nome, setNome]       = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleCriar() {
    const n = nome.trim()
    if (!n) { setErro('Introduz um nome para a pasta.'); return }
    setLoading(true); setErro('')
    const res = await api.post(`/condominios/${condominioId}/documentos/pasta`, {
      folder_id: currentFolderId,
      name: n,
    })
    setLoading(false)
    if (res?.ok) { onCreated(res.item); onClose() }
    else setErro(res?.error || 'Erro ao criar pasta.')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C.white, borderRadius: '0.75rem', padding: '1.5rem',
        width: '100%', maxWidth: '360px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)', fontFamily: 'DM Sans, sans-serif',
      }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: C.navy }}>
          📁 Nova Pasta
        </h3>
        <input
          autoFocus
          type="text"
          placeholder="Nome da pasta"
          value={nome}
          onChange={e => { setNome(e.target.value); setErro('') }}
          onKeyDown={e => e.key === 'Enter' && handleCriar()}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: `1.5px solid ${erro ? '#dc2626' : C.border}`,
            borderRadius: '0.5rem', padding: '0.5rem 0.75rem',
            fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', color: C.text, outline: 'none',
          }}
        />
        {erro && <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#dc2626' }}>{erro}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.45rem 1rem', fontSize: '0.875rem', cursor: 'pointer',
            color: C.muted, fontFamily: 'DM Sans, sans-serif',
          }}>Cancelar</button>
          <button onClick={handleCriar} disabled={loading} style={{
            background: loading ? C.border : C.navy, color: loading ? C.muted : C.white,
            border: 'none', borderRadius: '0.5rem', padding: '0.45rem 1.25rem',
            fontSize: '0.875rem', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}>
            {loading ? '⏳ A criar…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Upload Manager ────────────────────────────────────────────────────────────

function UploadManager({ uploads }) {
  if (uploads.length === 0) return null
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '0.75rem', padding: '0.875rem 1rem', marginBottom: '1rem',
    }}>
      <p style={{ margin: '0 0 0.625rem', fontSize: '0.78rem', fontWeight: 600, color: C.muted, letterSpacing: '0.03em' }}>
        A CARREGAR
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {uploads.map(u => (
          <div key={u.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '0.8rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                {u.status === 'done'     && '✅ '}
                {u.status === 'error'    && '❌ '}
                {u.status === 'uploading' && '⬆️ '}
                {u.status === 'pending'  && '⏳ '}
                {u.name}
              </span>
              <span style={{ fontSize: '0.75rem', color: u.status === 'error' ? '#dc2626' : C.muted, flexShrink: 0, marginLeft: '0.5rem' }}>
                {u.status === 'done'     ? 'Concluído'
                 : u.status === 'error'  ? (u.error || 'Erro')
                 : u.status === 'pending' ? 'A aguardar…'
                 : `${u.progress}%`}
              </span>
            </div>
            {(u.status === 'uploading' || u.status === 'pending') && (
              <div style={{ height: '4px', background: C.borderL, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: C.blue, borderRadius: '2px',
                  width: `${u.progress}%`, transition: 'width 0.2s ease',
                }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────

function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const counter = useRef(0)

  function onDragEnter(e) { e.preventDefault(); counter.current++; if (counter.current === 1) setDragging(true) }
  function onDragLeave(e) { e.preventDefault(); counter.current--; if (counter.current === 0) setDragging(false) }
  function onDragOver(e)  { e.preventDefault() }
  function onDrop(e) {
    e.preventDefault(); counter.current = 0; setDragging(false)
    const items = e.dataTransfer?.items
    if (items) {
      const files = []
      for (const item of items) { if (item.kind === 'file') files.push(item.getAsFile()) }
      if (files.length > 0) onFiles(files)
    } else if (e.dataTransfer?.files) {
      onFiles(e.dataTransfer.files)
    }
  }

  return (
    <div
      onDragEnter={onDragEnter} onDragLeave={onDragLeave}
      onDragOver={onDragOver}   onDrop={onDrop}
      style={{
        border: `2px dashed ${dragging ? C.blue : C.border}`,
        borderRadius: '0.75rem',
        padding: dragging ? '1.25rem' : '0.625rem',
        marginBottom: '0.875rem',
        background: dragging ? C.blueL : 'transparent',
        textAlign: 'center', fontSize: '0.8rem',
        color: dragging ? C.blue : C.subtle,
        transition: 'all 0.15s', cursor: 'default',
      }}
    >
      {dragging ? '📂 Larga aqui para fazer upload' : 'Arrasta ficheiros ou pastas aqui'}
    </div>
  )
}

// ── Toolbar Documentos ────────────────────────────────────────────────────────

function ToolbarDocumentos({ condominioId, currentFolderId, onPastaCreated, onUploadDone }) {
  const [modalPasta, setModalPasta] = useState(false)
  const [uploads, setUploads]       = useState([])
  const inputFichRef  = useRef()
  const inputPastaRef = useRef()

  function updateUpload(id, patch) {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }

  async function processarFicheiros(files) {
    if (!files || files.length === 0) return

    const novos = Array.from(files).map((f, i) => ({
      id:           `${Date.now()}-${i}`,
      name:         f.name,
      relativePath: f.webkitRelativePath || '',
      file:         f,
      progress:     0,
      status:       'pending',
      error:        null,
    }))

    setUploads(prev => [...prev, ...novos])

    const token = localStorage.getItem('session_token') || ''
    const baseUrl = 'https://api.condexpress.com'
    const BATCH   = 20

    for (let start = 0; start < novos.length; start += BATCH) {
      const batch = novos.slice(start, start + BATCH)
      const fd    = new FormData()
      fd.append('folder_id', currentFolderId || '')

      const relPaths = []
      for (const u of batch) {
        fd.append('files', u.file, u.name)
        relPaths.push(u.relativePath)
        updateUpload(u.id, { status: 'uploading' })
      }
      fd.append('relative_paths', JSON.stringify(relPaths))

      try {
        const res = await uploadComProgresso({
          url:        `${baseUrl}/condominios/${condominioId}/documentos/upload`,
          formData:   fd,
          token,
          onProgress: (pct) => { for (const u of batch) updateUpload(u.id, { progress: pct }) },
        })

        const errosPorNome = {}
        for (const e of (res.errors || [])) errosPorNome[e.name] = e.error

        for (const u of batch) {
          const nome = u.relativePath ? u.relativePath.split('/').pop() : u.name
          if (errosPorNome[nome]) updateUpload(u.id, { status: 'error', error: errosPorNome[nome], progress: 0 })
          else                    updateUpload(u.id, { status: 'done', progress: 100 })
        }

        if (res.items?.length > 0) onUploadDone()

      } catch (err) {
        for (const u of batch) updateUpload(u.id, { status: 'error', error: err.message, progress: 0 })
      }
    }

    setTimeout(() => setUploads(prev => prev.filter(u => u.status !== 'done')), 3000)
  }

  function handleFicheiros(e) { processarFicheiros(e.target.files); e.target.value = '' }
  function handlePasta(e)     { processarFicheiros(e.target.files); e.target.value = '' }

  const btnToolbar = {
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: '0.5rem', padding: '0.4rem 0.875rem',
    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
    color: C.navy, fontFamily: 'DM Sans, sans-serif',
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setModalPasta(true)} style={btnToolbar}>📁 Nova pasta</button>
        <button onClick={() => inputFichRef.current?.click()}  style={btnToolbar}>⬆️ Upload ficheiros</button>
        <button onClick={() => inputPastaRef.current?.click()} style={btnToolbar}>📂 Upload pasta</button>
        <input ref={inputFichRef}  type="file" multiple style={{ display: 'none' }} onChange={handleFicheiros} />
        <input ref={inputPastaRef} type="file" multiple webkitdirectory="true" style={{ display: 'none' }} onChange={handlePasta} />
      </div>

      <DropZone onFiles={processarFicheiros} />
      <UploadManager uploads={uploads} />

      {modalPasta && (
        <ModalNovaPasta
          condominioId={condominioId}
          currentFolderId={currentFolderId}
          onClose={() => setModalPasta(false)}
          onCreated={(item) => { onPastaCreated(item); setModalPasta(false) }}
        />
      )}
    </>
  )
}

// ── Tab Documentos ────────────────────────────────────────────────────────────

function TabDocumentos({ condominioId }) {
  const [loading, setLoading]               = useState(true)
  const [items, setItems]                   = useState([])
  const [available, setAvailable]           = useState(true)
  const [erro, setErro]                     = useState('')
  const [breadcrumb, setBreadcrumb]         = useState([])
  const [rootFolderId, setRootFolderId]     = useState(null)
  const [currentFolderId, setCurrentFolderId] = useState(null)

  async function carregar(folderId = null) {
    setLoading(true); setErro('')
    const qs   = folderId ? `?folder_id=${folderId}` : ''
    const data = await api.get(`/condominios/${condominioId}/documentos${qs}`)
    if (!data?.available) { setAvailable(false); setLoading(false); return }
    setAvailable(true)
    setRootFolderId(data.root_folder_id)
    setCurrentFolderId(folderId || data.root_folder_id)
    setItems(data.items || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [condominioId])

  function entrarPasta(item) {
    setBreadcrumb(prev => [...prev, { id: item.id, name: item.name }])
    carregar(item.id)
  }

  function navegarBreadcrumb(idx) {
    if (idx === -1) { setBreadcrumb([]); carregar(null) }
    else {
      const crumb = breadcrumb[idx]
      setBreadcrumb(prev => prev.slice(0, idx + 1))
      carregar(crumb.id)
    }
  }

  function handlePastaCreated(item) {
    setItems(prev => [item, ...prev])
  }

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
      <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</span>
      A carregar documentos…
    </div>
  )

  if (!available) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
      <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>📂</span>
      <p style={{ margin: '0 0 1.25rem', color: C.muted }}>Pasta OneDrive não configurada para este condomínio.</p>
      <SyncButton condominioId={condominioId} onSuccess={() => carregar()} />
    </div>
  )

  if (erro) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: '#dc2626', fontSize: '0.875rem' }}>{erro}</div>
  )

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
        <button onClick={() => navegarBreadcrumb(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontFamily: 'DM Sans, sans-serif', padding: '0.25rem 0.375rem', borderRadius: '0.25rem', fontWeight: breadcrumb.length === 0 ? 700 : 400 }}>
          📁 Raiz
        </button>
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: C.subtle }}>›</span>
            <button onClick={() => navegarBreadcrumb(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === breadcrumb.length - 1 ? C.text : C.blue, fontFamily: 'DM Sans, sans-serif', padding: '0.25rem 0.375rem', borderRadius: '0.25rem', fontWeight: i === breadcrumb.length - 1 ? 700 : 400 }}>
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Toolbar — Nova Pasta + Upload */}
      <ToolbarDocumentos
        condominioId={condominioId}
        currentFolderId={currentFolderId}
        onPastaCreated={handlePastaCreated}
        onUploadDone={() => carregar(currentFolderId)}
      />

      {/* Lista */}
      {items.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>Pasta vazia.</div>
      ) : (
        <div style={{ background: C.surface, borderRadius: '0.75rem', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
                <th style={{ ...thDoc, textAlign: 'left' }}>Nome</th>
                <th style={{ ...thDoc, textAlign: 'right' }}>Tamanho</th>
                <th style={{ ...thDoc, textAlign: 'right' }}>Modificado</th>
                <th style={{ ...thDoc, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id}
                  style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc', cursor: item.type === 'folder' ? 'pointer' : 'default' }}
                  onClick={() => item.type === 'folder' && entrarPasta(item)}
                  onMouseEnter={e => e.currentTarget.style.background = C.blueL}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : '#fafbfc'}
                >
                  <td style={{ padding: '0.625rem 1rem', color: item.type === 'folder' ? C.navy : C.text }}>
                    <span style={{ marginRight: '0.5rem' }}>{fileIcon(item)}</span>
                    <span style={{ fontWeight: item.type === 'folder' ? 600 : 400 }}>{item.name}</span>
                    {item.type === 'folder' && item.children > 0 && (
                      <span style={{ fontSize: '0.72rem', color: C.subtle, marginLeft: '0.5rem' }}>({item.children})</span>
                    )}
                  </td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: C.muted, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {item.type === 'folder' ? '—' : formatSize(item.size)}
                  </td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: C.muted, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {formatDate(item.modified)}
                  </td>
                  <td style={{ padding: '0.625rem 1rem', textAlign: 'center' }}>
                    {item.type === 'file' && (
                      <a href={item.webUrl} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '0.75rem', color: C.blue, fontWeight: 600, textDecoration: 'none', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: C.blueL }}>
                        Abrir
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thDoc = {
  padding: '0.6rem 1rem', textAlign: 'left',
  fontWeight: 600, fontSize: '0.75rem',
  color: C.muted, letterSpacing: '0.03em', whiteSpace: 'nowrap'
}

// ── Tab Placeholder ───────────────────────────────────────────────────────────

function TabPlaceholder({ icon, title, description }) {
  return (
    <div style={{ padding: '4rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{icon}</div>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C.text, margin: '0 0 0.5rem', fontFamily: 'DM Sans, sans-serif' }}>{title}</h3>
      <p style={{ fontSize: '0.875rem', color: C.muted, margin: 0 }}>{description}</p>
    </div>
  )
}

// ── Painel de Detalhe ─────────────────────────────────────────────────────────

const TABS = [
  { key: 'info',       label: 'Informação' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'fracoes',    label: 'Frações e Condóminos' },
  { key: 'contratos',  label: 'Contratos' },
  { key: 'financeiro', label: 'Info. Financeira' },
]

function TabFinanceiro({ condominioId, condominioNome, condominioIban }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Débito Directo */}
      <div style={{ background: C.surface, borderRadius: '0.75rem', border: `1px solid ${C.border}`, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(1,22,64,0.05)' }}>
        <SeccaoDebitoDireto condominioId={condominioId} condominioNome={condominioNome} condominioIban={condominioIban} />
      </div>

      {/* Cobranças */}
      <div style={{ background: C.surface, borderRadius: '0.75rem', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(1,22,64,0.05)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.borderL}` }}>
          <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Cobranças</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
              {['Data', 'Ficheiro', 'Montante', 'Estado'].map(h => (
                <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.75rem', color: C.muted, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} style={{ padding: '2.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
                Sem cobranças registadas.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  )
}

function DetalheCondominio({ condominio: condominioInicial, onVoltar }) {
const [tab, setTab] = useState('info')
const [condominio, setCondominio] = useState(condominioInicial)
const [modalEditar, setModalEditar] = useState(false)

  return (
    <div style={{ animation: 'fadeIn 0.18s ease' }}>
      <style>{`
              @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
              #tabela-documentos td { text-align: left; }
            `}
      </style>

      {/* Voltar */}
      <button onClick={onVoltar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: '0.875rem', marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500, transition: 'background 0.12s' }}
        onMouseEnter={e => e.currentTarget.style.background = C.blueL}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        ← Voltar aos condomínios
      </button>
      {/* Editar */}
            <button
        onClick={() => setModalEditar(true)}
        style={{ background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.125rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
      >
        ✏️ Editar
      </button>

      {/* Cabeçalho */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ background: C.navy, color: C.white, borderRadius: '0.375rem', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }}>
            {condominio.n_impar}
          </span>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
            {condominio.nome}
          </h2>
        </div>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: C.muted }}>
          {condominio.loja_nome}{condominio.n_fracoes ? ` · ${condominio.n_fracoes} frações` : ''}
          {condominio.gestor ? ` · Gestor: ${condominio.gestor}` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: '1.5rem', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0.625rem 1.125rem',
            fontSize: '0.82rem', fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? C.navy : C.muted,
            borderBottom: tab === t.key ? `2px solid ${C.navy}` : '2px solid transparent',
            marginBottom: '-2px', whiteSpace: 'nowrap',
            fontFamily: 'DM Sans, sans-serif', transition: 'all 0.12s'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      {tab === 'info'       && <TabInfo c={condominio} />}
      {tab === 'documentos' && <TabDocumentos condominioId={condominio.id} />}
      {tab === 'contratos' && <TabContratos condominioId={condominio.id} lojaId={condominio.loja_id} />}
      {tab === 'financeiro' && <TabFinanceiro condominioId={condominio.id} condominioNome={condominio.nome} condominioIban={condominio.iban} />}
      {tab === 'fracoes' && <TabCondominos condominioId={condominio.id} />}
     {modalEditar && (
        <ModalEditar
          condominio={condominio}
          onClose={() => setModalEditar(false)}
          onSave={(updated) => {
            setCondominio(updated)
            setModalEditar(false)
          }}
        />
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Condominios() {
  const [condominios, setCondominios] = useState([])
  const [lojas, setLojas]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [detalhe, setDetalhe]         = useState(null)
  const [modalEditar, setModalEditar] = useState(false)
  const [pagina, setPagina]   = useState(1)
  const [limite, setLimite]   = useState(50)
  const [total, setTotal]     = useState(0)
  const [filtros, setFiltros] = useState({ n_impar: '', nome: '', loja_id: '', gestor: '', ativo: 'true' })
  const [gestores, setGestores] = useState([])

  async function carregar(f = filtros, pg = pagina, lim = limite) {
  setLoading(true)
  const params = new URLSearchParams()
  if (f.n_impar) params.set('n_impar', f.n_impar)
  if (f.nome)    params.set('nome', f.nome)
  if (f.loja_id) params.set('loja_id', f.loja_id)
  if (f.gestor) params.set('gestor', f.gestor)
  params.set('ativo', f.ativo || 'true')  
  params.set('page',  pg)
  params.set('limit', lim)
  const data = await api.get(`/condominios?${params}`)
  setCondominios(data?.condominios || [])
  setTotal(data?.total || 0)
  setPagina(data?.page || 1)
  setLoading(false)
}

async function carregarLojas() {
  const data = await api.get('/lojas')
  setLojas(data?.lojas || [])
}

async function carregarGestores() {
  const data = await api.get('/utilizadores/gestores')
  setGestores(data?.utilizadores || [])
}

  useEffect(() => { carregar(filtros, pagina, limite); carregarLojas(); carregarGestores() }, [])

  function handleFiltro(e) { setFiltros({ ...filtros, [e.target.name]: e.target.value }) }
  function handleSubmit(e) { e.preventDefault(); setPagina(1); carregar(filtros, 1, limite) }

  // Detalhe
  if (detalhe) return (
    <DetalheCondominio
      condominio={detalhe}
      onVoltar={() => setDetalhe(null)}
    />
  )

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button type="button" onClick={() => setModalAberto(true)} style={{ ...btnPrimary, background: '#16a34a' }}>+ Novo Condomínio</button>
      </div>
      {/* Filtros */}
      <form onSubmit={handleSubmit} style={{
        background: C.surface, borderRadius: '0.875rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(1,22,64,0.06)',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>N Impar</label>
          <input name="n_impar" value={filtros.n_impar} onChange={handleFiltro} placeholder="ex: 351"
            style={{ ...inputSt, width: '120px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Nome</label>
          <input name="nome" value={filtros.nome} onChange={handleFiltro} placeholder="Pesquisar nome..."
            style={{ ...inputSt, width: '220px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Loja</label>
          <select name="loja_id" value={filtros.loja_id} onChange={handleFiltro}
            style={{ ...inputSt, width: '160px' }}>
            <option value="">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Gestor</label>
        <select name="gestor" value={filtros.gestor} onChange={handleFiltro}
          style={{ ...inputSt, width: '200px' }}>
          <option value="">Todos os gestores</option>
          {gestores.map(g => <option key={g.id} value={g.email}>{g.nome}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.1rem' }}>
        <input
          type="checkbox"
          id="mostrar-inativos"
          checked={filtros.ativo === 'false'}
          onChange={e => {
            const f = { ...filtros, ativo: e.target.checked ? 'false' : 'true' }
            setFiltros(f)
            setPagina(1)
            carregar(f, 1, limite)
          }}
          style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: C.navy }}
        />
        <label htmlFor="mostrar-inativos" style={{ fontSize: '0.82rem', fontWeight: 500, color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Inativos?
        </label>
      </div>
        <button type="submit" style={{ ...btnPrimary }}>Filtrar</button>
        <button type="button" onClick={() => {
        const f = { n_impar: '', nome: '', loja_id: '', gestor: '', ativo: 'true' }
        setFiltros(f)
        setPagina(1)
        carregar(f, 1, limite)
      }} style={{ ...btnSecondary }}>Limpar</button>
        <div style={{ flex: 1 }} />
        </form>

      {/* Tabela */}
      <div style={{ background: C.surface, borderRadius: '0.875rem', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
            <span style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem' }}>⏳</span>A carregar…
          </div>
        ) : condominios.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>Nenhum condomínio encontrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
                {['N Impar', 'Nome', 'Loja', 'Gestor', 'Telefone', 'Email'].map(h => (
                  <th key={h} style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '0.775rem', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {condominios.map((c, i) => (
                <tr key={c.id}
                  onClick={() => setDetalhe(c)}
                  style={{ borderBottom: `1px solid ${C.borderL}`, cursor: 'pointer', background: i % 2 === 0 ? C.white : '#fafbfc' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.blueL}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : '#fafbfc'}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: C.navy }}>{c.n_impar}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.text }}>{c.nome}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.muted }}>{c.loja_nome}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.muted }}>{c.gestor || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.muted }}>{c.telefone || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.muted }}>{c.email_gestor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
{/* Paginação */}
<div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
  <p style={{ margin: 0, fontSize: '0.75rem', color: C.subtle }}>
    {total === 0 ? 'Nenhum resultado' : `${(pagina - 1) * limite + 1}–${Math.min(pagina * limite, total)} de ${total} condomínios`}
  </p>
  <div style={{ flex: 1 }} />
  <select
    value={limite}
    onChange={e => { const l = parseInt(e.target.value); setLimite(l); setPagina(1); carregar(filtros, 1, l) }}
    style={{ ...inputSt, width: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.6rem' }}
  >
    {[25, 50, 100].map(n => <option key={n} value={n}>{n} por página</option>)}
  </select>
  <button
    disabled={pagina <= 1}
    onClick={() => { const p = pagina - 1; setPagina(p); carregar(filtros, p, limite) }}
    style={{ ...btnSecondary, opacity: pagina <= 1 ? 0.4 : 1, padding: '0.35rem 0.875rem' }}
  >← Anterior</button>
  <span style={{ fontSize: '0.78rem', color: C.muted, fontWeight: 600 }}>
    Pág. {pagina} / {Math.max(1, Math.ceil(total / limite))}
  </span>
  <button
    disabled={pagina * limite >= total}
    onClick={() => { const p = pagina + 1; setPagina(p); carregar(filtros, p, limite) }}
    style={{ ...btnSecondary, opacity: pagina * limite >= total ? 0.4 : 1, padding: '0.35rem 0.875rem' }}
  >Próxima →</button>
</div>

      {modalAberto && (
        <Modal lojas={lojas} onClose={() => setModalAberto(false)}
          onSave={(n_impar) => { setModalAberto(false); carregar(); alert(`✅ Condomínio criado! N Impar: ${n_impar}`) }}
        />
      )}

      {modalEditar && (
      <ModalEditar
        condominio={condominio}
        lojas={[]}
        onClose={() => setModalEditar(false)}
        onSave={(updated) => {
          setCondominio(updated)
          setModalEditar(false)
        }}
      />
    )}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputSt = {
  padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`,
  borderRadius: '0.5rem', fontSize: '0.875rem',
  fontFamily: 'DM Sans, sans-serif', color: C.text, background: C.white
}

const btnPrimary = {
  background: C.navy, color: C.white, border: 'none',
  borderRadius: '0.5rem', padding: '0.5rem 1.25rem',
  fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif'
}

const btnSecondary = {
  background: '#f1f5f9', color: C.muted, border: 'none',
  borderRadius: '0.5rem', padding: '0.5rem 1rem',
  fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif'
}