// ── TabContratos ──────────────────────────────────────────────────────────────
// Adicionar ao Condominios.jsx em substituição do TabPlaceholder de contratos
//
// Uso: {tab === 'contratos' && <TabContratos condominioId={condominio.id} />}
//
// Requer no topo do Condominios.jsx:
//   import TabContratos from './TabContratos'   (se ficheiro separado)
//   ou copiar este conteúdo directamente para Condominios.jsx

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
  { key: 'ativo',      label: 'Ativo',      color: '#16a34a', bg: '#dcfce7' },
  { key: 'suspenso',   label: 'Suspenso',   color: '#d97706', bg: '#fef3c7' },
  { key: 'terminado',  label: 'Terminado',  color: '#dc2626', bg: '#fef2f2' },
]

const PERIODICIDADES = [
  { key: 'mensal',      label: 'Mensal',      meses: 12 },
  { key: 'trimestral',  label: 'Trimestral',  meses: 4  },
  { key: 'semestral',   label: 'Semestral',   meses: 2  },
  { key: 'anual',       label: 'Anual',       meses: 1  },
]

const cfgEstado = k => ESTADOS_CONTRATO.find(e => e.key === k) || ESTADOS_CONTRATO[0]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function totalAnual(valor, periodicidade) {
  if (!valor) return null
  const p = PERIODICIDADES.find(p => p.key === periodicidade)
  return valor * (p?.meses || 12)
}

function formatEur(val) {
  if (val === null || val === undefined) return '—'
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
const FORM_VAZIO_CONTRATO = {
  tipo: 'condominio',
  prestador_id: '',
  data_inicio: '',
  data_fim: '',
  estado: 'ativo',
  renovacao_automatica: false,
  documento_url: '',
  condicoes: '',
}

function ModalContrato({ inicial, condominioId, prestadores, servicosCatalogo, onGuardar, onFechar, loading }) {
  const [form, setForm]       = useState(inicial || FORM_VAZIO_CONTRATO)
  const [servicos, setServicos] = useState(inicial?.servicos || [])

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

  function toggleServico(servicoId) {
    setServicos(prev => {
      const existe = prev.find(s => s.servico_id === servicoId)
      if (existe) return prev.filter(s => s.servico_id !== servicoId)
      return [...prev, { servico_id: servicoId, valor_mensal: '', periodicidade: 'mensal', estimativa: false, observacoes: '' }]
    })
  }

  function updateServico(servicoId, campo, valor) {
    setServicos(prev => prev.map(s => s.servico_id === servicoId ? { ...s, [campo]: valor } : s))
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
            {inicial ? 'Editar Contrato' : 'Novo Contrato'}
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Tipo */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Tipo</label>
          <select style={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="condominio">Contrato</option>
            <option value="prestador">Prestador</option>
          </select>
        </div>

        {/* Prestador (só se tipo = prestador) */}
        {form.tipo === 'prestador' && (
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
            <input
              type="checkbox" id="renovacao" checked={form.renovacao_automatica}
              onChange={e => set('renovacao_automatica', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="renovacao" style={{ fontSize: '0.875rem', color: C.text, cursor: 'pointer' }}>Renovação automática</label>
          </div>
        </div>

        {/* Documento URL */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Documento <span style={{ fontWeight: 400, textTransform: 'none' }}>(link OneDrive — opcional)</span></label>
          <input style={inp} value={form.documento_url} onChange={e => set('documento_url', e.target.value)} placeholder="https://..." />
        </div>

        {/* Condições */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={lbl}>Condições gerais</label>
          <textarea style={{ ...inp, resize: 'vertical', minHeight: '3.5rem' }} value={form.condicoes} onChange={e => set('condicoes', e.target.value)} placeholder="Notas e condições do contrato..." />
        </div>

        {/* Serviços */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ ...lbl, marginBottom: '0.75rem' }}>Serviços incluídos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {servicosCatalogo.map(s => {
              const sel = servicos.find(sv => sv.servico_id === s.id)
              return (
                <div key={s.id} style={{
                  border: `1px solid ${sel ? C.blue : C.border}`,
                  borderRadius: '0.5rem', overflow: 'hidden',
                  background: sel ? C.blueL : C.white,
                }}>
                  {/* Header do serviço */}
                  <div
                    onClick={() => toggleServico(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.875rem', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={!!sel} onChange={() => toggleServico(s.id)} style={{ width: 15, height: 15 }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: sel ? 600 : 400, color: sel ? C.navy : C.text }}>{s.nome}</span>
                    {s.categoria === 'custom' && <Badge label="Custom" color={C.muted} bg="#f1f5f9" />}
                  </div>

                  {/* Detalhes (só se seleccionado) */}
                  {sel && (
                    <div style={{ padding: '0 0.875rem 0.875rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ ...lbl, marginBottom: '0.2rem' }}>Valor (€)</label>
                        <input
                          type="number" min="0" step="0.01"
                          style={{ ...inp, fontSize: '0.82rem' }}
                          value={sel.valor_mensal}
                          onChange={e => updateServico(s.id, 'valor_mensal', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label style={{ ...lbl, marginBottom: '0.2rem' }}>Periodicidade</label>
                        <select style={{ ...inp, fontSize: '0.82rem' }} value={sel.periodicidade} onChange={e => updateServico(s.id, 'periodicidade', e.target.value)}>
                          {PERIODICIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input type="checkbox" id={`est-${s.id}`} checked={sel.estimativa} onChange={e => updateServico(s.id, 'estimativa', e.target.checked)} style={{ width: 14, height: 14 }} />
                        <label htmlFor={`est-${s.id}`} style={{ fontSize: '0.78rem', color: C.muted, cursor: 'pointer' }}>Valor estimado</label>
                      </div>
                      <div>
                        <label style={{ ...lbl, marginBottom: '0.2rem' }}>Observações</label>
                        <input style={{ ...inp, fontSize: '0.82rem' }} value={sel.observacoes} onChange={e => updateServico(s.id, 'observacoes', e.target.value)} placeholder="Notas..." />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
            onClick={() => onGuardar({ ...form, servicos })}
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
function CardContrato({ contrato, servicosCatalogo, onEditar, onLog }) {
  const [logAberto, setLogAberto] = useState(false)
  const [logs, setLogs]           = useState([])
  const [loadingLog, setLoadingLog] = useState(false)
  const estado = cfgEstado(contrato.estado)

  async function carregarLogs() {
    if (logs.length > 0) { setLogAberto(v => !v); return }
    setLoadingLog(true)
    const data = await api.get(`/contratos/${contrato.id}/logs`)
    setLogs(data.logs || [])
    setLoadingLog(false)
    setLogAberto(true)
  }

  const totalServicos = contrato.servicos?.reduce((acc, s) => {
    const anual = totalAnual(s.valor_mensal, s.periodicidade)
    return acc + (anual || 0)
  }, 0)

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '0.875rem', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(1,22,64,0.06)', marginBottom: '1rem',
    }}>
      {/* Cabeçalho do card */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${C.borderL}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Badge label={estado.label} color={estado.color} bg={estado.bg} />
          {contrato.tipo === 'prestador' && contrato.prestador_nome && (
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text }}>{contrato.prestador_nome}</span>
          )}
          <span style={{ fontSize: '0.78rem', color: C.muted }}>
            {formatDate(contrato.data_inicio)} → {contrato.data_fim ? formatDate(contrato.data_fim) : 'sem fim'}
          </span>
          {contrato.renovacao_automatica && (
            <Badge label="Renovação auto." color="#0891b2" bg="#ecfeff" />
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {contrato.documento_url && (
            <a href={contrato.documento_url} target="_blank" rel="noreferrer" style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.35rem',
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
                  <td style={{ padding: '0.5rem 1rem', color: C.text, fontWeight: 500 }}>{s.servico_nome}</td>
                  <td style={{ padding: '0.5rem 1rem', color: C.text }}>{formatEur(s.valor_mensal)}</td>
                  <td style={{ padding: '0.5rem 1rem', color: C.muted }}>{PERIODICIDADES.find(p => p.key === s.periodicidade)?.label || s.periodicidade}</td>
                  <td style={{ padding: '0.5rem 1rem', color: C.text, fontWeight: 600 }}>
                    {formatEur(totalAnual(s.valor_mensal, s.periodicidade))}
                    {s.estimativa && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: C.muted }}>(est.)</span>}
                  </td>
                  <td style={{ padding: '0.5rem 1rem' }}>
                    {s.observacoes && <span style={{ fontSize: '0.72rem', color: C.subtle }} title={s.observacoes}>💬</span>}
                  </td>
                </tr>
              ))}
              {/* Total */}
              <tr style={{ background: '#f7f9fc', borderTop: `1.5px solid ${C.border}` }}>
                <td colSpan={3} style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total anual</td>
                <td colSpan={2} style={{ padding: '0.5rem 1rem', fontWeight: 700, color: C.navy, fontSize: '0.875rem' }}>{formatEur(totalServicos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: C.subtle, fontSize: '0.82rem' }}>
          Sem serviços associados.
        </div>
      )}

      {/* Condições */}
      {contrato.condicoes && (
        <div style={{ padding: '0.75rem 1.25rem', borderTop: `1px solid ${C.borderL}`, fontSize: '0.78rem', color: C.muted }}>
          <strong style={{ color: C.subtle }}>Condições:</strong> {contrato.condicoes}
        </div>
      )}

      {/* Histórico */}
      <div style={{ borderTop: `1px solid ${C.borderL}` }}>
        <button
          onClick={carregarLogs}
          style={{ width: '100%', background: 'none', border: 'none', padding: '0.6rem 1.25rem', cursor: 'pointer', fontSize: '0.75rem', color: C.muted, textAlign: 'left', fontFamily: 'DM Sans, sans-serif', display: 'flex', justifyContent: 'space-between' }}
        >
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
                      {' '}
                      {new Date(log.criado_em).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
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

// ── TabContratos (componente principal) ───────────────────────────────────────
export default function TabContratos({ condominioId }) {
  const [contratos,       setContratos]       = useState([])
  const [servicosCatalogo, setServicosCatalogo] = useState([])
  const [prestadores,     setPrestadores]     = useState([])
  const [loading,         setLoading]         = useState(true)
  const [modal,           setModal]           = useState(null)  // null | 'novo_condominio' | 'novo_prestador' | { contrato }
  const [loadingGuardar,  setLoadingGuardar]  = useState(false)
  const [secao,           setSecao]           = useState('condominio') // 'condominio' | 'prestador'

  useEffect(() => {
    Promise.all([
      api.get(`/contratos?condominio_id=${condominioId}`).then(r => r.contratos || []),
      api.get('/servicos').then(r => r.servicos || []),
      api.get('/prestadores').then(r => r.prestadores || []),
    ]).then(([c, s, p]) => {
      setContratos(c)
      setServicosCatalogo(s)
      setPrestadores(p)
      setLoading(false)
    })
  }, [condominioId])

  async function handleGuardar(form) {
    setLoadingGuardar(true)
    try {
      const payload = { ...form, condominio_id: condominioId }
      if (modal?.contrato) {
        await api.put(`/contratos/${modal.contrato.id}`, payload)
      } else {
        await api.post('/contratos', payload)
      }
      // Recarregar
      const data = await api.get(`/contratos?condominio_id=${condominioId}`)
      setContratos(data.contratos || [])
      setModal(null)
    } catch (e) {
      alert('Erro: ' + e.message)
    } finally {
      setLoadingGuardar(false)
    }
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
          onClick={() => setModal(secao === 'condominio' ? 'novo_condominio' : 'novo_prestador')}
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
            servicosCatalogo={servicosCatalogo}
            onEditar={contrato => setModal({ contrato })}
          />
        ))
      )}

      {/* Modal */}
      {modal && (
        <ModalContrato
          inicial={modal?.contrato ? {
            tipo:                 modal.contrato.tipo,
            prestador_id:         modal.contrato.prestador_id        || '',
            data_inicio:          modal.contrato.data_inicio?.slice(0, 10) || '',
            data_fim:             modal.contrato.data_fim?.slice(0, 10)    || '',
            estado:               modal.contrato.estado,
            renovacao_automatica: modal.contrato.renovacao_automatica,
            documento_url:        modal.contrato.documento_url        || '',
            condicoes:            modal.contrato.condicoes            || '',
            servicos:             modal.contrato.servicos             || [],
          } : {
            ...FORM_VAZIO_CONTRATO,
            tipo: secao,
          }}
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
