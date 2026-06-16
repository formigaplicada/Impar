import { useState, useEffect } from 'react'
import { api } from '../lib/api'

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInicioSemana(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function getFimSemana(d) {
  const inicio = getInicioSemana(d)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 6)
  fim.setHours(23, 59, 59, 999)
  return fim
}

function toISO(d) { return d.toISOString().slice(0, 10) }

function formatDatePt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function periodoLabel(tipo, data_inicio) {
  const d = new Date(data_inicio)
  if (tipo === 'semana') {
    const inicio = getInicioSemana(d)
    const fim    = getFimSemana(d)
    return `${formatDatePt(toISO(inicio))} – ${formatDatePt(toISO(fim))}`
  } else {
    return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })
  }
}

function navegarPeriodo(tipo, data_inicio, direcao) {
  const d = new Date(data_inicio)
  if (tipo === 'semana') {
    d.setDate(d.getDate() + direcao * 7)
    return toISO(getInicioSemana(d))
  } else {
    d.setMonth(d.getMonth() + direcao)
    return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
  }
}

function calcPeriodo(tipo, data_inicio) {
  if (tipo === 'semana') {
    const d = new Date(data_inicio)
    return { data_inicio: toISO(getInicioSemana(d)), data_fim: toISO(getFimSemana(d)) }
  } else {
    const d = new Date(data_inicio)
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1)
    const fim    = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { data_inicio: toISO(inicio), data_fim: toISO(fim) }
  }
}

function calcEsperado(periodicidade, tipoPeriodo) {
  if (tipoPeriodo === 'semana') {
    const map = { 'diario': 7, '3xsemana': 3, '2xsemana': 2, '1xsemana': 1, '3xmes': 0, '2xmes': 0, '1xmes': 0, 'anual': 0 }
    return map[periodicidade] ?? 0
  } else {
    const map = { 'diario': 30, '3xsemana': 12, '2xsemana': 8, '1xsemana': 4, '3xmes': 3, '2xmes': 2, '1xmes': 1, 'anual': 0 }
    return map[periodicidade] ?? 0
  }
}

// ── Modal Novo Prestador ──────────────────────────────────────────────────────

function Modal({ onClose, onSave }) {
  const [nifInput, setNifInput] = useState('')
  const [loadingNif, setLoadingNif] = useState(false)
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false)
  const [form, setForm] = useState({
    nif: '', nome: '', natureza: '', capital: '', estado: 'active',
    data_inicio: '', cae: '', actividade: '', morada: '', cidade: '',
    codigo_postal: '', regiao: '', concelho: '', freguesia: '',
    email: '', telefone: '', website: ''
  })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [nifErro, setNifErro] = useState('')

  async function pesquisarNif() {
    if (!nifInput || nifInput.length < 9) { setNifErro('NIF inválido.'); return }
    setLoadingNif(true); setNifErro('')
    const res = await api.get(`/nif/${nifInput}`)
    if (res?.ok) {
      setForm({ ...res.dados, nif: nifInput, estado: res.dados.estado || 'active', data_inicio: res.dados.data_inicio || '' })
      setMostrarDetalhes(false)
    } else {
      setNifErro(res?.error || 'NIF não encontrado.')
    }
    setLoadingNif(false)
  }

  function handleChange(e) { setForm({ ...form, [e.target.name]: e.target.value }) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nome) { setErro('Nome é obrigatório.'); return }
    setLoading(true); setErro('')
    const res = await api.post('/prestadores', form)
    if (res?.ok) { onSave() }
    else { setErro(res?.error || 'Erro ao criar prestador.'); setLoading(false) }
  }

  const inputField = (label, name, type = 'text') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>{label}</label>
      <input type={type} name={name} value={form[name] || ''} onChange={handleChange}
        style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: C.white, borderRadius: '1rem', width: '100%', maxWidth: '36rem', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text, margin: 0 }}>Novo Prestador</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: C.subtle }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: C.bg, borderRadius: '0.75rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>Pesquisar por NIF</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={nifInput} onChange={e => setNifInput(e.target.value)} placeholder="NIF (9 dígitos)" maxLength={9}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }} />
                <button type="button" onClick={pesquisarNif} disabled={loadingNif} style={{
                  background: C.blue, color: C.white, border: 'none', borderRadius: '0.5rem',
                  padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  opacity: loadingNif ? 0.6 : 1, whiteSpace: 'nowrap'
                }}>{loadingNif ? 'A pesquisar...' : '🔍 Pesquisar'}</button>
              </div>
              {nifErro && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.5rem' }}>❌ {nifErro}</p>}
              {form.nome && <p style={{ color: '#16a34a', fontSize: '0.8rem', marginTop: '0.5rem' }}>✓ Dados preenchidos — revê antes de guardar</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Nome *</label>
                <input name="nome" value={form.nome || ''} onChange={handleChange} required
                  style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${!form.nome ? '#fca5a5' : C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>NIF</label>
                <input name="nif" value={form.nif || ''} onChange={handleChange}
                  style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif' }} />
              </div>
              {inputField('Email', 'email', 'email')}
              {inputField('Telefone', 'telefone', 'tel')}
            </div>

            <button type="button" onClick={() => setMostrarDetalhes(!mostrarDetalhes)} style={{
              background: 'none', border: `1.5px dashed ${C.border}`, borderRadius: '0.5rem',
              padding: '0.625rem', fontSize: '0.8rem', color: C.muted,
              cursor: 'pointer', textAlign: 'center', fontFamily: 'DM Sans, sans-serif'
            }}>{mostrarDetalhes ? '▲ Ocultar dados adicionais' : '▼ Ver dados adicionais'}</button>

            {mostrarDetalhes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>Identificação</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {inputField('Natureza', 'natureza')}
                    {inputField('Capital', 'capital')}
                    {inputField('Data Início', 'data_inicio', 'date')}
                    {inputField('CAE', 'cae')}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Actividade</label>
                      <textarea name="actividade" value={form.actividade || ''} onChange={handleChange} rows={2}
                        style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif', resize: 'vertical' }} />
                    </div>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>Localização</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>{inputField('Morada', 'morada')}</div>
                    {inputField('Cidade', 'cidade')}
                    {inputField('Código Postal', 'codigo_postal')}
                    {inputField('Região', 'regiao')}
                    {inputField('Concelho', 'concelho')}
                    {inputField('Freguesia', 'freguesia')}
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.subtle, marginBottom: '0.75rem' }}>Outros contactos</p>
                  {inputField('Website', 'website')}
                </div>
              </div>
            )}

            {erro && <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>❌ {erro}</p>}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ background: '#f1f5f9', color: C.muted, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ background: C.blue, color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'A criar...' : 'Criar Prestador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Detalhe Prestador ─────────────────────────────────────────────────────────

function DetalhePrestador({ prestador, onVoltar }) {
  const hoje = new Date()
  const [tipoPeriodo,    setTipoPeriodo]    = useState('semana')
  const [dataReferencia, setDataReferencia] = useState(toISO(getInicioSemana(hoje)))
  const [contratos,      setContratos]      = useState([])
  const [loading,        setLoading]        = useState(true)

  const periodo = calcPeriodo(tipoPeriodo, dataReferencia)

  async function carregar() {
    setLoading(true)
    const data = await api.get(
      `/prestadores/${prestador.id}/contratos?data_inicio=${periodo.data_inicio}&data_fim=${periodo.data_fim}`
    )
    setContratos(data?.contratos || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [prestador.id, periodo.data_inicio, periodo.data_fim])

  function mudarTipo(novo) {
    setTipoPeriodo(novo)
    if (novo === 'semana') setDataReferencia(toISO(getInicioSemana(new Date())))
    else setDataReferencia(toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  }

  const thStyle = {
    padding: '0.5rem 0.875rem', textAlign: 'left', fontWeight: 600,
    fontSize: '0.7rem', color: C.subtle, letterSpacing: '0.05em',
    textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap', background: '#f7f9fc',
  }
  const tdStyle = {
    padding: '0.6rem 0.875rem', fontSize: '0.82rem',
    color: C.text, borderBottom: `1px solid ${C.borderL}`,
    verticalAlign: 'middle',
  }

  const totalEsperado  = contratos.reduce((acc, r) => acc + calcEsperado(r.periodicidade, tipoPeriodo), 0)
  const totalRealizado = contratos.some(r => r.limpezas_periodo !== null)
    ? contratos.reduce((acc, r) => acc + (r.limpezas_periodo || 0), 0)
    : null

  return (
    <div style={{ animation: 'fadeIn 0.18s ease' }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }`}</style>

      <button onClick={onVoltar} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: C.blue,
        fontSize: '0.875rem', marginBottom: '1.5rem', display: 'inline-flex',
        alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem',
        borderRadius: '0.375rem', fontFamily: 'DM Sans, sans-serif', fontWeight: 500,
      }}
        onMouseEnter={e => e.currentTarget.style.background = C.blueL}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >← Voltar aos prestadores</button>

      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
          {prestador.nome}
        </h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: C.muted }}>
          {prestador.nif     && <span>NIF {prestador.nif} · </span>}
          {prestador.email   && <span>{prestador.email} · </span>}
          {prestador.telefone && <span>{prestador.telefone}</span>}
        </p>
      </div>

      {/* Filtro período */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        boxShadow: '0 1px 3px rgba(1,22,64,0.06)',
      }}>
        <div style={{ display: 'flex', background: C.bg, borderRadius: '0.5rem', padding: '0.2rem' }}>
          {['semana', 'mes'].map(t => (
            <button key={t} onClick={() => mudarTipo(t)} style={{
              background: tipoPeriodo === t ? C.navy : 'none',
              color: tipoPeriodo === t ? C.white : C.muted,
              border: 'none', borderRadius: '0.375rem',
              padding: '0.35rem 0.875rem', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.12s',
            }}>{t === 'semana' ? 'Semana' : 'Mês'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setDataReferencia(navegarPeriodo(tipoPeriodo, dataReferencia, -1))} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.375rem',
            padding: '0.35rem 0.625rem', cursor: 'pointer', color: C.muted, fontSize: '0.875rem',
          }}>‹</button>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: C.navy, minWidth: '160px', textAlign: 'center' }}>
            {periodoLabel(tipoPeriodo, dataReferencia)}
          </span>
          <button onClick={() => setDataReferencia(navegarPeriodo(tipoPeriodo, dataReferencia, 1))} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.375rem',
            padding: '0.35rem 0.625rem', cursor: 'pointer', color: C.muted, fontSize: '0.875rem',
          }}>›</button>
        </div>
        <button onClick={() => {
          const d = new Date()
          if (tipoPeriodo === 'semana') setDataReferencia(toISO(getInicioSemana(d)))
          else setDataReferencia(toISO(new Date(d.getFullYear(), d.getMonth(), 1)))
        }} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.375rem',
          padding: '0.35rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer',
          color: C.muted, fontFamily: 'DM Sans, sans-serif',
        }}>Hoje</button>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: C.subtle }}>⏳ A carregar…</div>
      ) : contratos.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          Sem contratos registados para este prestador.
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Condomínio</th>
                  <th style={thStyle}>Serviço</th>
                  <th style={thStyle}>Periodicidade</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Esperado</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Realizado</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((r, i) => {
                  const esperado  = calcEsperado(r.periodicidade, tipoPeriodo)
                  const realizado = r.limpezas_periodo
                  const ok        = realizado !== null && realizado >= esperado
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.navy }}>{r.condominio_nome}</td>
                      <td style={tdStyle}>{r.servico_nome || '—'}</td>
                      <td style={{ ...tdStyle, color: C.muted }}>{r.periodicidade || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>{esperado || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {realizado === null ? (
                          <span style={{ color: C.subtle }}>—</span>
                        ) : (
                          <span style={{
                            background: ok ? '#dcfce7' : '#fef2f2',
                            color: ok ? '#16a34a' : '#dc2626',
                            borderRadius: '0.375rem', padding: '0.2rem 0.6rem',
                            fontSize: '0.78rem', fontWeight: 700,
                          }}>{realizado}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0f3f7', borderTop: `2px solid ${C.border}` }}>
                  <td style={{ ...tdStyle, fontWeight: 700, color: C.navy }}>
                    Total — {contratos.length} condomínio{contratos.length !== 1 ? 's' : ''}
                  </td>
                  <td colSpan={2} style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: C.navy }}>{totalEsperado}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: C.navy }}>
                    {totalRealizado !== null ? totalRealizado : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lista Prestadores ─────────────────────────────────────────────────────────

export default function Prestadores() {
  const [prestadores,  setPrestadores]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modalAberto,  setModalAberto]  = useState(false)
  const [filtros,      setFiltros]      = useState({ nome: '', loja_id: '', servico_id: '' })
  const [lojas,        setLojas]        = useState([])
  const [servicos,     setServicos]     = useState([])
  const [detalhe,      setDetalhe]      = useState(null)

  async function carregar(f = filtros) {
    setLoading(true)
    const params = new URLSearchParams()
    if (f.nome)       params.set('nome',       f.nome)
    if (f.loja_id)    params.set('loja_id',    f.loja_id)
    if (f.servico_id) params.set('servico_id', f.servico_id)
    const data = await api.get(`/prestadores?${params}`)
    setPrestadores(data?.prestadores || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    api.get('/lojas').then(r => setLojas(r.lojas || []))
    api.get('/servicos').then(r => setServicos((r.servicos || []).filter(s => s.em_prestador)))
  }, [])

  function handleFiltro(e) { setFiltros(f => ({ ...f, [e.target.name]: e.target.value })) }

  if (detalhe) return (
    <DetalhePrestador prestador={detalhe} onVoltar={() => setDetalhe(null)} />
  )

  return (
    <div>
      <form onSubmit={e => { e.preventDefault(); carregar(filtros) }} style={{
        background: C.surface, borderRadius: '0.875rem',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(1,22,64,0.06)',
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Nome</label>
          <input name="nome" value={filtros.nome} onChange={handleFiltro} placeholder="Pesquisar nome..."
            style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', width: '220px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Loja</label>
          <select name="loja_id" value={filtros.loja_id} onChange={handleFiltro}
            style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', width: '160px' }}>
            <option value="">Todas as lojas</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 500, color: C.muted }}>Serviço</label>
          <select name="servico_id" value={filtros.servico_id} onChange={handleFiltro}
            style={{ padding: '0.5rem 0.75rem', border: `1.5px solid ${C.border}`, borderRadius: '0.5rem', fontSize: '0.875rem', width: '180px' }}>
            <option value="">Todos os serviços</option>
            {servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <button type="submit" style={{ background: C.blue, color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Filtrar</button>
        <button type="button" onClick={() => { setFiltros({ nome: '', loja_id: '', servico_id: '' }); carregar({}) }}
          style={{ background: '#f1f5f9', color: C.muted, border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Limpar</button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setModalAberto(true)}
          style={{ background: '#16a34a', color: C.white, border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>+ Novo Prestador</button>
      </form>

      <div style={{ background: C.surface, borderRadius: '0.875rem', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle }}>
            <span style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem' }}>⏳</span>A carregar…
          </div>
        ) : prestadores.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: C.subtle }}>Nenhum prestador encontrado.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f7f9fc', borderBottom: `1.5px solid ${C.border}` }}>
                {['NIF', 'Nome', 'Serviços', 'Contacto'].map(h => (
                  <th key={h} style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, color: C.muted, fontSize: '0.775rem', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prestadores.map((p, i) => (
                <tr key={p.id}
                  onClick={() => setDetalhe(p)}
                  style={{ borderBottom: `1px solid ${C.borderL}`, cursor: 'pointer', background: i % 2 === 0 ? C.white : '#fafbfc' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.blueL}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : '#fafbfc'}
                >
                  <td style={{ padding: '0.75rem 1rem', color: C.muted, fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.nif || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: C.navy }}>{p.nome}</td>
                  <td style={{ padding: '0.75rem 1rem', color: C.muted, fontSize: '0.8rem' }}>{p.servicos || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {p.email    && <div style={{ color: C.blue,  fontSize: '0.82rem' }}>{p.email}</div>}
                    {p.telefone && <div style={{ color: C.muted, fontSize: '0.82rem' }}>{p.telefone}</div>}
                    {!p.email && !p.telefone && <span style={{ color: C.subtle }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: C.subtle }}>
        {prestadores.length} prestador{prestadores.length !== 1 ? 'es' : ''}
      </p>

      {modalAberto && (
        <Modal
          onClose={() => setModalAberto(false)}
          onSave={() => { setModalAberto(false); carregar() }}
        />
      )}
    </div>
  )
}