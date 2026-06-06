// ── TabContratos ──────────────────────────────────────────────────────────────
// Uso em Condominios.jsx:
//   import TabContratos from './TabContratos'
//   {tab === 'contratos' && <TabContratos condominioId={condominio.id} />}

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

const ESTADOS_CONTRATO = [
  { key: 'ativo',     label: 'Ativo',     color: '#16a34a', bg: '#dcfce7' },
  { key: 'suspenso',  label: 'Suspenso',  color: '#d97706', bg: '#fef3c7' },
  { key: 'terminado', label: 'Terminado', color: '#dc2626', bg: '#fef2f2' },
]

const PERIODICIDADES = [
  { key: 'mensal',     label: 'Mensal',     meses: 12 },
  { key: 'trimestral', label: 'Trimestral', meses: 4  },
  { key: 'semestral',  label: 'Semestral',  meses: 2  },
  { key: 'anual',      label: 'Anual',      meses: 1  },
]

const cfgEstado = k => ESTADOS_CONTRATO.find(e => e.key === k) || ESTADOS_CONTRATO[0]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function totalAnual(valor, periodicidade) {
  if (!valor) return null
  const p = PERIODICIDADES.find(p => p.key === periodicidade)
  return Number(valor) * (p?.meses || 12)
}

function formatEur(val) {
  if (val === null || val === undefined || val === '') return '—'
  return Number(val).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      background: bg, color, borderRadius: '0.3rem',
      padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Modal Contrato ────────────────────────────────────────────────────────────
const FORM_VAZIO = {
  tipo: 'condominio',
  prestador_id: '',
  data_inicio: '',
  data_fim: '',
  estado: 'ativo',
  renovacao_automatica: false,
  documento_url: '',
  condicoes: '',
}

function ModalContrato({ inicial, tipo, condominioId, prestadores, servicosCatalogo, onGuardar, onFechar, loading }) {
  const [form, setForm]     = useState(inicial || { ...FORM_VAZIO, tipo })
  const [servicos, setServicos] = useState(inicial?.servicos || [])
  const [customInput, setCustomInput] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Filtrar catálogo conforme tipo
  const catalogoFiltrado = servicosCatalogo.filter(s =>
    tipo === 'condominio' ? s.em_contrato : s.em_prestador
  )

  function toggleServico(s) {
    setServicos(prev => {
      const existe = prev.find(sv => sv.servico_id === s.id)
      if (existe) return prev.filter(sv => sv.servico_id !== s.id)
      return [...prev, {
        servico_id: s.id,
        nome_custom: null,
        valor_mensal: '',
        periodicidade: 'mensal',
        estimativa: false,
        observacoes: '',
      }]
    })
  }

  function addCustom() {
    const nome = customInput.trim()
    if (!nome) return
    setServicos(prev => [...prev, {
      servico_id: null,
      nome_custom: nome,
      valor_mensal: '',
      periodicidade: 'mensal',
      estimativa: false,
      observacoes: '',
    }])
    setCustomInput('')
  }

  function removeCustom(idx) {
    setServicos(prev => prev.filter((_, i) => i !== idx))
  }

  function updateServico(identifier, campo, valor) {
    // identifier é servico_id (string) ou index (number) para custom
    setServicos(prev => prev.map((s, i) => {
      const match = typeof identifier === 'number' ? i === identifier : s.servico_id === identifier
      return match ? { ...s, [campo]: valor } : s
    }))
  }

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

  // Render campos de detalhe de um serviço seleccionado
  function DetalheServico({ sv, identifier, nome }) {
    return (
      <div style={{ padding: '0 0.875rem 0.875rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={{ ...lbl, marginBottom: '0.2rem' }}>Valor (€)</label>
          <input
            type="number" min="0" step="0.01"
            style={{ ...inp, fontSize: '0.82rem' }}
            value={sv.valor_mensal}
            onChange={e => updateServico(identifier, 'valor_mensal', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={{ ...lbl, marginBottom: '0.2rem' }}>Periodicidade</label>
          <select style={{ ...inp, fontSize: '0.82rem' }} value={sv.periodicidade} onChange={e => updateServico(identifier, 'periodicidade', e.target.value)}>
            {PERIODICIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            id={`est-${identifier}`}
            checked={sv.estimativa}
            onChange={e => updateServico(identifier, 'estimativa', e.target.checked)}
            style={{ width: 14, height: 14 }}
          />
          <label htmlFor={`est-${identifier}`} style={{ fontSize: '0.78rem', color: C.muted, cursor: 'pointer' }}>Valor estimado</label>
        </div>
        <div>
          <label style={{ ...lbl, marginBottom: '0.2rem' }}>Observações</label>
          <input style={{ ...inp, fontSize: '0.82rem' }} value={sv.observacoes} onChange={e => updateServico(identifier, 'observacoes', e.target.value)} placeholder="Notas..." />
        </div>
      </div>
    )
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            {inicial ? 'Editar' : 'Novo'} {tipo === 'condominio' ? 'Contrato' : 'Contrato de Prestador'}
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Prestador (só tipo prestador) */}
        {tipo === 'prestador' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Prestador</label>
            <select style={inp} value={form.prestador_id} onChange={e => set('prestador_id', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {prestadores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        )}

        {/* Datas */}
        <div style={row2}>
          <div>
            <label style={lbl}>Data de início *</label>
            <input type="date" style={inp} value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Data de fim <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span></label>
            <input type="date" style={inp} value={form.data_fim} onChange={e => set('data_fim', e.target.value)} />
          </div>
        </div>

        {/* Estado + Renovação */}
        <div style={row2}>
          <div>
            <label style={lbl}>Estado</label>
            <select style={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
              {ESTADOS_CONTRATO.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input type="checkbox" id="renovacao" checked={form.renovacao_automatica} onChange={e => set('renovacao_automatica', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="renovacao" style={{ fontSize: '0.875rem', color: C.text, cursor: 'pointer' }}>Renovação automática</label>
          </div>
        </div>

        {/* Documento */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Documento <span style={{ fontWeight: 400, textTransform: 'none' }}>(link OneDrive — opcional)</span></label>
          <input style={inp} value={form.documento_url} onChange={e => set('documento_url', e.target.value)} placeholder="https://..." />
        </div>

        {/* Condições */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={lbl}>Condições gerais</label>
          <textarea style={{ ...inp, resize: 'vertical', minHeight: '3.5rem' }} value={form.condicoes} onChange={e => set('condicoes', e.target.value)} placeholder="Notas e condições do contrato..." />
        </div>

        {/* Serviços do catálogo */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ ...lbl, marginBottom: '0.75rem' }}>Serviços incluídos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {catalogoFiltrado.map(s => {
              const sel = servicos.find(sv => sv.servico_id === s.id)
              return (
                <div key={s.id} style={{
                  border: `1px solid ${sel ? C.blue : C.border}`,
                  borderRadius: '0.5rem', overflow: 'hidden',
                  background: sel ? C.blueL : C.white,
                }}>
                  <div onClick={() => toggleServico(s)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.875rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!sel} onChange={() => toggleServico(s)} style={{ width: 15, height: 15 }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: sel ? 600 : 400, color: sel ? C.navy : C.text }}>{s.nome}</span>
                  </div>
                  {sel && <DetalheServico sv={sel} identifier={s.id} nome={s.nome} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Serviços custom (Outros) */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ ...lbl, marginBottom: '0.75rem' }}>Outros serviços</label>

          {/* Serviços custom já adicionados */}
          {servicos.filter(sv => !sv.servico_id).map((sv, i) => {
            const idx = servicos.indexOf(sv)
            return (
              <div key={i} style={{
                border: `1px solid ${C.blue}`, borderRadius: '0.5rem',
                overflow: 'hidden', background: C.blueL, marginBottom: '0.4rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.875rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.navy }}>{sv.nome_custom}</span>
                  <button onClick={() => removeCustom(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1rem' }}>✕</button>
                </div>
                <DetalheServico sv={sv} identifier={idx} nome={sv.nome_custom} />
              </div>
            )
          })}

          {/* Input para adicionar novo */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={{ ...inp, flex: 1 }}
              placeholder="Nome do serviço..."
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            />
            <button
              onClick={addCustom}
              disabled={!customInput.trim()}
              style={{
                background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600,
                cursor: customInput.trim() ? 'pointer' : 'not-allowed',
                opacity: customInput.trim() ? 1 : 0.5,
                fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
              }}
            >+ Adicionar</button>
          </div>
        </div>

        {/* Acções */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button onClick={onFechar} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer',
            color: C.muted, fontFamily: 'DM Sans, sans-serif',
          }}>Cancelar</button>
          <button
            onClick={() => onGuardar({ ...form, tipo, servicos })}
            disabled={!form.data_inicio || loading}
            style={{
              background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
              padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: (!form.data_inicio || loading) ? 0.6 : 1,
            }}
          >{loading ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Card de Contrato ──────────────────────────────────────────────────────────
function CardContrato({ contrato, onEditar }) {
  const [logAberto,   setLogAberto]   = useState(false)
  const [logs,        setLogs]        = useState([])
  const [loadingLog,  setLoadingLog]  = useState(false)
  const estado = cfgEstado(contrato.estado)

  async function carregarLogs() {
    if (logAberto) { setLogAberto(false); return }
    if (logs.length === 0) {
      setLoadingLog(true)
      const data = await api.get(`/contratos/${contrato.id}/logs`)
      setLogs(data.logs || [])
      setLoadingLog(false)
    }
    setLogAberto(true)
  }

  const totalServicos = contrato.servicos?.reduce((acc, s) => acc + (totalAnual(s.valor_mensal, s.periodicidade) || 0), 0)

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '0.875rem', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(1,22,64,0.06)', marginBottom: '1rem',
    }}>
      {/* Cabeçalho */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${C.borderL}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Badge label={estado.label} color={estado.color} bg={estado.bg} />
          {contrato.prestador_nome && (
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text }}>{contrato.prestador_nome}</span>
          )}
          <span style={{ fontSize: '0.78rem', color: C.muted }}>
            {formatDate(contrato.data_inicio)} → {contrato.data_fim ? formatDate(contrato.data_fim) : 'sem fim'}
          </span>
          {contrato.renovacao_automatica && <Badge label="Renovação auto." color="#0891b2" bg="#ecfeff" />}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {contrato.documento_url && (
            <a href={contrato.documento_url} target="_blank" rel="noreferrer" style={{
              border: `1px solid ${C.border}`, borderRadius: '0.35rem',
              padding: '0.2rem 0.6rem', fontSize: '0.72rem', color: C.blue,
              textDecoration: 'none', fontWeight: 600,
            }}>📄 Doc</a>
          )}
          <button onClick={() => onEditar(contrato)} style={{
            background: 'none', border: `1px solid ${C.navy}`, borderRadius: '0.35rem',
            padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', color: C.navy, fontWeight: 600,
          }}>Editar</button>
        </div>
      </div>

      {/* Tabela de serviços */}
      {contrato.servicos?.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#f7f9fc' }}>
                {['Serviço', 'Valor', 'Periodicidade', 'Total Anual', ''].map(h => (
                  <th key={h} style={{ padding: '0.5rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.7rem', color: C.subtle, letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contrato.servicos.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < contrato.servicos.length - 1 ? `1px solid ${C.borderL}` : 'none' }}>
                  <td style={{ padding: '0.5rem 1rem', color: C.text, fontWeight: 500 }}>
                    {s.servico_nome || s.nome_custom}
                    {s.nome_custom && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: C.subtle }}>(outro)</span>}
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>{formatEur(s.valor_mensal)}</td>
                  <td style={{ padding: '0.5rem 1rem', color: C.muted }}>{PERIODICIDADES.find(p => p.key === s.periodicidade)?.label || s.periodicidade}</td>
                  <td style={{ padding: '0.5rem 1rem', fontWeight: 600 }}>
                    {formatEur(totalAnual(s.valor_mensal, s.periodicidade))}
                    {s.estimativa && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: C.muted }}>(est.)</span>}
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    {s.observacoes && <span style={{ fontSize: '0.72rem', color: C.subtle }} title={s.observacoes}>💬</span>}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f7f9fc', borderTop: `1.5px solid ${C.border}` }}>
                <td colSpan={3} style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total anual</td>
                <td colSpan={2} style={{ padding: '0.5rem 1rem', fontWeight: 700, color: C.navy }}>{formatEur(totalServicos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.82rem' }}>Sem serviços associados.</div>
      )}

      {/* Condições */}
      {contrato.condicoes && (
        <div style={{ padding: '0.75rem 1.25rem', borderTop: `1px solid ${C.borderL}`, fontSize: '0.78rem', color: C.muted }}>
          <strong style={{ color: C.subtle }}>Condições:</strong> {contrato.condicoes}
        </div>
      )}

      {/* Histórico */}
      <div style={{ borderTop: `1px solid ${C.borderL}` }}>
        <button onClick={carregarLogs} style={{ width: '100%', background: 'none', border: 'none', padding: '0.6rem 1.25rem', cursor: 'pointer', fontSize: '0.75rem', color: C.muted, textAlign: 'left', fontFamily: 'DM Sans, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
          <span>🕐 Histórico de alterações</span>
          <span>{logAberto ? '▲' : '▼'}</span>
        </button>
        {logAberto && (
          <div style={{ padding: '0 1.25rem 1rem' }}>
            {loadingLog ? (
              <div style={{ color: C.subtle, fontSize: '0.78rem', textAlign: 'center', padding: '1rem' }}>A carregar…</div>
            ) : logs.length === 0 ? (
              <div style={{ color: C.subtle, fontSize: '0.78rem' }}>Sem alterações registadas.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {logs.map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                    <span style={{ color: C.subtle, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(log.criado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      {' '}{new Date(log.criado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: C.muted, flexShrink: 0 }}>{log.utilizador_nome || '—'}</span>
                    <span style={{ color: C.text }}>{log.acao}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TabContratos({ condominioId }) {
  const [contratos,        setContratos]        = useState([])
  const [servicosCatalogo, setServicosCatalogo] = useState([])
  const [prestadores,      setPrestadores]      = useState([])
  const [loading,          setLoading]          = useState(true)
  const [modal,            setModal]            = useState(null) // null | { tipo, contrato? }
  const [loadingGuardar,   setLoadingGuardar]   = useState(false)
  const [secao,            setSecao]            = useState('condominio')

  async function carregar() {
    const [c, s, p] = await Promise.all([
      api.get(`/contratos?condominio_id=${condominioId}`).then(r => r.contratos || []),
      api.get('/servicos').then(r => r.servicos || []),
      api.get('/prestadores').then(r => r.prestadores || []),
    ])
    setContratos(c); setServicosCatalogo(s); setPrestadores(p); setLoading(false)
  }

  useEffect(() => { carregar() }, [condominioId])

  async function handleGuardar(form) {
    setLoadingGuardar(true)
    try {
      const payload = { ...form, condominio_id: condominioId }
      if (modal?.contrato) await api.put(`/contratos/${modal.contrato.id}`, payload)
      else                 await api.post('/contratos', payload)
      await carregar()
      setModal(null)
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoadingGuardar(false) }
  }

  const contratosCondominio = contratos.filter(c => c.tipo === 'condominio')
  const contratosPrestador  = contratos.filter(c => c.tipo === 'prestador')
  const listaActual         = secao === 'condominio' ? contratosCondominio : contratosPrestador

  const secaoStyle = ativo => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0.5rem 1rem', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif',
    fontWeight: ativo ? 700 : 400, color: ativo ? C.navy : C.muted,
    borderBottom: ativo ? `2px solid ${C.navy}` : '2px solid transparent',
    marginBottom: '-1px',
  })

  return (
    <div>
      {/* Sub-navegação */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: '1.25rem' }}>
        <button style={secaoStyle(secao === 'condominio')} onClick={() => setSecao('condominio')}>
          Contrato ({contratosCondominio.length})
        </button>
        <button style={secaoStyle(secao === 'prestador')} onClick={() => setSecao('prestador')}>
          Prestadores ({contratosPrestador.length})
        </button>
      </div>

      {/* Botão adicionar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button
          onClick={() => setModal({ tipo: secao })}
          style={{
            background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
            padding: '0.5rem 1.125rem', fontSize: '0.82rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >+ {secao === 'condominio' ? 'Novo Contrato' : 'Novo Prestador'}</button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: C.subtle }}>⏳ A carregar…</div>
      ) : listaActual.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          {secao === 'condominio' ? 'Sem contratos registados.' : 'Sem contratos com prestadores.'}
        </div>
      ) : (
        listaActual.map(c => (
          <CardContrato
            key={c.id}
            contrato={c}
            onEditar={contrato => setModal({ tipo: contrato.tipo, contrato })}
          />
        ))
      )}

      {/* Modal */}
      {modal && (
        <ModalContrato
          tipo={modal.tipo}
          inicial={modal.contrato ? {
            tipo:                 modal.contrato.tipo,
            prestador_id:         modal.contrato.prestador_id            || '',
            data_inicio:          modal.contrato.data_inicio?.slice(0,10) || '',
            data_fim:             modal.contrato.data_fim?.slice(0,10)    || '',
            estado:               modal.contrato.estado,
            renovacao_automatica: modal.contrato.renovacao_automatica,
            documento_url:        modal.contrato.documento_url            || '',
            condicoes:            modal.contrato.condicoes                || '',
            servicos:             modal.contrato.servicos                 || [],
          } : null}
          condominioId={condominioId}
          prestadores={prestadores}
          servicosCatalogo={servicosCatalogo}
          onGuardar={handleGuardar}
          onFechar={() => setModal(null)}
          loading={loadingGuardar}
        />
      )}
    </div>
  )
}
