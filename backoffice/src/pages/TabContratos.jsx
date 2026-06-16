// ── TabContratos ──────────────────────────────────────────────────────────────
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

const PERIODICIDADES_IMPAR = [
  { key: 'mensal',     label: 'Mensal',     meses: 12 },
  { key: 'trimestral', label: 'Trimestral', meses: 4  },
  { key: 'semestral',  label: 'Semestral',  meses: 2  },
  { key: 'anual',      label: 'Anual',      meses: 1  },
]

const PERIODICIDADES_SERVICO = [
  { key: 'diario',    label: 'Diário' },
  { key: '1xmes',     label: '1x/mês' },
  { key: '2xmes',     label: '2x/mês' },
  { key: '3xmes',     label: '3x/mês' },
  { key: '1xsemana',  label: '1x/semana' },
  { key: '2xsemana',  label: '2x/semana' },
  { key: '3xsemana',  label: '3x/semana' },
]

const cfgEstado = k => ESTADOS_CONTRATO.find(e => e.key === k) || ESTADOS_CONTRATO[0]

function periodicidadeLabel(key, tipo) {
  const lista = tipo === 'prestador' ? PERIODICIDADES_SERVICO : PERIODICIDADES_IMPAR
  return lista.find(p => p.key === key)?.label || key
}

function totalAnual(valor, periodicidade) {
  if (!valor) return null
  const p = PERIODICIDADES_IMPAR.find(p => p.key === periodicidade)
  return p ? Number(valor) * p.meses : null
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

// ── PrestadorPorServico ───────────────────────────────────────────────────────
function PrestadorPorServico({ servicosCatalogo, form, set, inp, lbl, lojaId }) {
  const [servicoSelId,  setServicoSelId]  = useState('')
  const [associados,    setAssociados]    = useState([])
  const [naoAssociados, setNaoAssociados] = useState([])
  const [loadingPrest,  setLoadingPrest]  = useState(false)
  const [mostrarAssoc,  setMostrarAssoc]  = useState(false)
  const [prestAssocId,  setPrestAssocId]  = useState('')
  const [salvandoAssoc, setSalvandoAssoc] = useState(false)

  async function carregarPrestadores(servicoId) {
    if (!servicoId) { setAssociados([]); setNaoAssociados([]); return }
    setLoadingPrest(true)
    const data = await api.get(`/prestadores/por-servico/${servicoId}?loja_id=${lojaId || ''}`)
    setAssociados(data.associados || [])
    setNaoAssociados(data.nao_associados || [])
    setLoadingPrest(false)
  }

  async function associarPrestador() {
    if (!prestAssocId || !servicoSelId) return
    setSalvandoAssoc(true)
    await api.post('/prestador-servicos', { prestador_id: Number(prestAssocId), servico_id: servicoSelId })
    await carregarPrestadores(servicoSelId)
    setPrestAssocId('')
    setMostrarAssoc(false)
    setSalvandoAssoc(false)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={lbl}>Serviço prestado</label>
      <select style={inp} value={servicoSelId} onChange={e => {
        setServicoSelId(e.target.value)
        set('prestador_id', '')
        carregarPrestadores(e.target.value)
      }}>
        <option value="">— Seleccionar serviço —</option>
        {servicosCatalogo.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>

      {servicoSelId && (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={lbl}>Prestador</label>
          {loadingPrest ? (
            <div style={{ fontSize: '0.82rem', color: C.muted, padding: '0.5rem' }}>A carregar…</div>
          ) : associados.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: C.subtle, padding: '0.5rem 0' }}>Sem prestadores associados.</div>
          ) : (
            <select style={inp} value={form.prestador_id} onChange={e => set('prestador_id', e.target.value)}>
              <option value="">— Seleccionar prestador —</option>
              {associados.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.cidade ? ` — ${p.cidade}` : ''}{p.contador > 1 ? ` (${p.contador}×)` : ''}
                </option>
              ))}
            </select>
          )}
          {!mostrarAssoc ? (
            <button type="button" onClick={() => setMostrarAssoc(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: C.blue,
              fontSize: '0.78rem', padding: '0.35rem 0', fontFamily: 'DM Sans, sans-serif', marginTop: '0.35rem',
            }}>+ Associar prestador a este serviço</button>
          ) : (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <select style={{ ...inp, flex: 1 }} value={prestAssocId} onChange={e => setPrestAssocId(e.target.value)}>
                <option value="">— Seleccionar prestador —</option>
                {naoAssociados.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cidade ? ` — ${p.cidade}` : ''}</option>)}
              </select>
              <button type="button" onClick={associarPrestador} disabled={!prestAssocId || salvandoAssoc} style={{
                background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 0.875rem', fontSize: '0.78rem', fontWeight: 600,
                cursor: prestAssocId ? 'pointer' : 'not-allowed',
                opacity: prestAssocId ? 1 : 0.5, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
              }}>{salvandoAssoc ? '…' : 'Associar'}</button>
              <button type="button" onClick={() => { setMostrarAssoc(false); setPrestAssocId('') }} style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem', fontSize: '0.78rem', cursor: 'pointer', color: C.muted,
              }}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal Contrato ────────────────────────────────────────────────────────────
const FORM_VAZIO = {
  tipo: 'condominio', prestador_id: '', data_inicio: '', data_fim: '',
  estado: 'ativo', renovacao_automatica: false, documento_url: '', condicoes: '',
}

// DetalheServico definido FORA do ModalContrato para evitar recriação a cada render
// (causa perda de foco nos inputs)
function DetalheServico({ sv, identifier, tipo, periodicidades, updateServico }) {
  const lbl = {
    fontSize: '0.72rem', fontWeight: 600, color: C.muted, marginBottom: '0.2rem',
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const inp = {
    width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${C.border}`,
    borderRadius: '0.5rem', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif',
    color: C.text, background: C.white, boxSizing: 'border-box',
  }
  return (
    <div style={{ padding: '0 0.875rem 0.875rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <div>
        <label style={lbl}>Valor mensal (€)</label>
        <input type="number" min="0" step="0.01" style={inp}
          value={sv.valor_mensal} onChange={e => updateServico(identifier, 'valor_mensal', e.target.value)} placeholder="0.00" />
      </div>
      <div>
        <label style={lbl}>{tipo === 'prestador' ? 'Periodicidade do serviço' : 'Periodicidade'}</label>
        <select style={inp} value={sv.periodicidade} onChange={e => updateServico(identifier, 'periodicidade', e.target.value)}>
          {periodicidades.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      {tipo === 'condominio' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" id={`est-${identifier}`} checked={sv.estimativa}
            onChange={e => updateServico(identifier, 'estimativa', e.target.checked)} style={{ width: 14, height: 14 }} />
          <label htmlFor={`est-${identifier}`} style={{ fontSize: '0.78rem', color: C.muted, cursor: 'pointer' }}>Valor estimado</label>
        </div>
      )}
      <div>
        <label style={lbl}>Observações</label>
        <input style={inp} value={sv.observacoes}
          onChange={e => updateServico(identifier, 'observacoes', e.target.value)} placeholder="Notas..." />
      </div>
    </div>
  )
}

function ModalContrato({ inicial, tipo, lojaId, condominioId, prestadores, servicosCatalogo, contratosExistentes, onGuardar, onFechar, loading }) {
  const modoEditar = !!inicial

  const [form, setForm]         = useState(inicial || { ...FORM_VAZIO, tipo })
  const [servicos, setServicos] = useState(inicial?.servicos || [])
  const [customInput, setCustomInput] = useState('')

  const periodicidades = tipo === 'prestador' ? PERIODICIDADES_SERVICO : PERIODICIDADES_IMPAR

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const lbl = {
    fontSize: '0.72rem', fontWeight: 600, color: C.muted, marginBottom: '0.3rem',
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em',
  }
  const inp = {
    width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${C.border}`,
    borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
    color: C.text, background: C.white, boxSizing: 'border-box',
  }
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }

  // Catálogo filtrado por tipo
  const catalogoFiltrado = servicosCatalogo.filter(s =>
    tipo === 'condominio' ? s.em_contrato : s.em_prestador
  )

  // No modo novo: filtrar pelos serviços que já têm contrato activo neste condomínio
  const servicosComContrato = new Set(
    contratosExistentes
      .filter(c => c.tipo === tipo && c.estado === 'ativo')
      .flatMap(c => c.servicos?.map(sv => sv.servico_id).filter(Boolean) || [])
  )
  const catalogoParaNovo = modoEditar
    ? catalogoFiltrado
    : catalogoFiltrado.filter(s => servicosComContrato.has(s.id))

  function toggleServico(s) {
    setServicos(prev => {
      const existe = prev.find(sv => sv.servico_id === s.id)
      if (existe) return prev.filter(sv => sv.servico_id !== s.id)
      return [...prev, {
        servico_id: s.id, nome_custom: null, valor_mensal: '',
        periodicidade: tipo === 'prestador' ? '1xmes' : 'mensal',
        estimativa: false, observacoes: '',
      }]
    })
  }

  function addCustom() {
    const nome = customInput.trim()
    if (!nome) return
    setServicos(prev => [...prev, {
      servico_id: null, nome_custom: nome, valor_mensal: '',
      periodicidade: tipo === 'prestador' ? '1xmes' : 'mensal',
      estimativa: false, observacoes: '',
    }])
    setCustomInput('')
  }

  function removeCustom(idx) { setServicos(prev => prev.filter((_, i) => i !== idx)) }

  function updateServico(identifier, campo, valor) {
    setServicos(prev => prev.map((s, i) => {
      const match = typeof identifier === 'number' ? i === identifier : s.servico_id === identifier
      return match ? { ...s, [campo]: valor } : s
    }))
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            {modoEditar ? 'Editar' : 'Novo'} {tipo === 'condominio' ? 'Contrato' : 'Contrato de Prestador'}
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Novo prestador: selector de serviço+prestador */}
        {tipo === 'prestador' && !modoEditar && (
          <PrestadorPorServico servicosCatalogo={catalogoFiltrado} form={form} set={set} inp={inp} lbl={lbl} lojaId={lojaId} />
        )}

        {/* Editar prestador: mostrar prestador actual (read-only) */}
        {tipo === 'prestador' && modoEditar && inicial?.prestador_nome && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Prestador</label>
            <div style={{ padding: '0.5rem 0.75rem', background: C.bg, borderRadius: '0.5rem', fontSize: '0.875rem', color: C.text, fontWeight: 600 }}>
              {inicial.prestador_nome}
            </div>
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
          {tipo === 'condominio' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
              <input type="checkbox" id="renovacao" checked={form.renovacao_automatica}
                onChange={e => set('renovacao_automatica', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="renovacao" style={{ fontSize: '0.875rem', color: C.text, cursor: 'pointer' }}>Renovação automática</label>
            </div>
          )}
        </div>

        {/* Documento */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Documento <span style={{ fontWeight: 400, textTransform: 'none' }}>(link OneDrive — opcional)</span></label>
          <input style={inp} value={form.documento_url} onChange={e => set('documento_url', e.target.value)} placeholder="https://..." />
        </div>

        {/* Condições */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={lbl}>Condições gerais</label>
          <textarea style={{ ...inp, resize: 'vertical', minHeight: '3.5rem' }} value={form.condicoes}
            onChange={e => set('condicoes', e.target.value)} placeholder="Notas e condições do contrato..." />
        </div>

        {/* Serviços — modo editar: só os do contrato; modo novo: só os com contrato activo */}
        {modoEditar ? (
          /* Editar: mostrar serviços existentes do contrato com campos editáveis */
          servicos.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ ...lbl, marginBottom: '0.75rem' }}>Serviços</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {servicos.map((sv, i) => (
                  <div key={sv.servico_id || i} style={{
                    border: `1px solid ${C.blue}`, borderRadius: '0.5rem',
                    overflow: 'hidden', background: C.blueL,
                  }}>
                    <div style={{ padding: '0.6rem 0.875rem', fontSize: '0.875rem', fontWeight: 600, color: C.navy }}>
                      {sv.servico_nome || sv.nome_custom}
                    </div>
                    <DetalheServico sv={sv} identifier={sv.servico_id || i} tipo={tipo} periodicidades={periodicidades} updateServico={updateServico} />
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          /* Novo: checkboxes dos serviços com contrato activo */
          catalogoParaNovo.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ ...lbl, marginBottom: '0.75rem' }}>Serviços incluídos</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {catalogoParaNovo.map(s => {
                  const sel = servicos.find(sv => sv.servico_id === s.id)
                  return (
                    <div key={s.id} style={{
                      border: `1px solid ${sel ? C.blue : C.border}`, borderRadius: '0.5rem',
                      overflow: 'hidden', background: sel ? C.blueL : C.white,
                    }}>
                      <div onClick={() => toggleServico(s)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.875rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!sel} onChange={() => toggleServico(s)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.875rem', fontWeight: sel ? 600 : 400, color: sel ? C.navy : C.text }}>{s.nome}</span>
                      </div>
                      {sel && <DetalheServico sv={sel} identifier={s.id} tipo={tipo} periodicidades={periodicidades} updateServico={updateServico} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        {/* Outros serviços (só no modo novo) */}
        {!modoEditar && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ ...lbl, marginBottom: '0.75rem' }}>Outros serviços</label>
            {servicos.filter(sv => !sv.servico_id).map((sv) => {
              const idx = servicos.indexOf(sv)
              return (
                <div key={idx} style={{ border: `1px solid ${C.blue}`, borderRadius: '0.5rem', overflow: 'hidden', background: C.blueL, marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.875rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.navy }}>{sv.nome_custom}</span>
                    <button onClick={() => removeCustom(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1rem' }}>✕</button>
                  </div>
                  <DetalheServico sv={sv} identifier={idx} tipo={tipo} periodicidades={periodicidades} updateServico={updateServico} />
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input style={{ ...inp, flex: 1 }} placeholder="Nome do serviço..."
                value={customInput} onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
              <button onClick={addCustom} disabled={!customInput.trim()} style={{
                background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600,
                cursor: customInput.trim() ? 'pointer' : 'not-allowed',
                opacity: customInput.trim() ? 1 : 0.5, fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
              }}>+ Adicionar</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button onClick={onFechar} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer',
            color: C.muted, fontFamily: 'DM Sans, sans-serif',
          }}>Cancelar</button>
          <button onClick={() => onGuardar({ ...form, tipo, servicos })} disabled={!form.data_inicio || loading} style={{
            background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
            padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            opacity: (!form.data_inicio || loading) ? 0.6 : 1,
          }}>{loading ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )

// ── Histórico ─────────────────────────────────────────────────────────────────
function HistoricoSection({ contratos }) {
  const [aberto, setAberto]       = useState(false)
  const [logs, setLogs]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [carregado, setCarregado] = useState(false)

  async function toggle() {
    if (aberto) { setAberto(false); return }
    if (!carregado) {
      setLoading(true)
      const resultados = await Promise.all(
        contratos.map(c => api.get(`/contratos/${c.id}/logs`).then(r => (r.logs || []).map(l => ({ ...l, contrato_id: c.id }))))
      )
      const todos = resultados.flat().sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
      setLogs(todos)
      setCarregado(true)
      setLoading(false)
    }
    setAberto(true)
  }

  return (
    <div style={{ borderTop: `1px solid ${C.borderL}` }}>
      <button onClick={toggle} style={{
        width: '100%', background: 'none', border: 'none', padding: '0.6rem 1.25rem',
        cursor: 'pointer', fontSize: '0.75rem', color: C.muted, textAlign: 'left',
        fontFamily: 'DM Sans, sans-serif', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>🕐 Histórico de alterações</span>
        <span>{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div style={{ padding: '0 1.25rem 1rem' }}>
          {loading ? (
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
  )
}

// ── Tabela Ímpar ──────────────────────────────────────────────────────────────
function TabelaContratosImpar({ contratos, onEditar }) {
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

  const linhas = contratos.map(c => {
    const sv     = c.servicos?.[0]
    const anual  = sv ? totalAnual(sv.valor_mensal, sv.periodicidade) : null
    const estado = cfgEstado(c.estado)
    return { contrato: c, sv, anual, estado }
  })

  const totalGeral = linhas.reduce((acc, { anual }) => acc + (anual || 0), 0)

  if (linhas.length === 0) return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
      Sem contratos registados.
    </div>
  )

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Serviço</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Data início</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Valor mensal</th>
              <th style={thStyle}>Período</th>
              <th style={{ ...thStyle, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ contrato: c, sv, anual, estado }, i) => (
              <tr key={c.id} style={{ background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                <td style={{ ...tdStyle, fontWeight: 500, color: C.navy }}>
                  {sv?.servico_nome || sv?.nome_custom || '—'}
                  {sv?.estimativa && <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', color: C.subtle }}>(est.)</span>}
                </td>
                <td style={tdStyle}>
                  <Badge label={estado.label} color={estado.color} bg={estado.bg} />
                </td>
                <td style={{ ...tdStyle, color: C.muted }}>{formatDate(c.data_inicio)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatEur(sv?.valor_mensal)}</td>
                <td style={{ ...tdStyle, color: C.muted }}>
                  {sv ? periodicidadeLabel(sv.periodicidade, 'condominio') : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button onClick={() => onEditar(c)} style={{
                    background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.35rem',
                    padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer',
                    color: C.navy, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                  }}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HistoricoSection contratos={contratos} />
    </div>
  )
}

// ── Tabela Prestador ──────────────────────────────────────────────────────────
function TabelaContratosPrestador({ contratos, onEditar }) {
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

  if (contratos.length === 0) return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem', padding: '3rem', textAlign: 'center', color: C.subtle }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
      Sem contratos de prestador registados.
    </div>
  )

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Prestador</th>
              <th style={thStyle}>Serviço</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Data início</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Valor mensal</th>
              <th style={thStyle}>Periodicidade do serviço</th>
              <th style={{ ...thStyle, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((c, i) => {
              const sv     = c.servicos?.[0]
              const estado = cfgEstado(c.estado)
              return (
                <tr key={c.id} style={{ background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: C.navy }}>
                    {c.prestador_nome || '—'}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    {sv?.servico_nome || sv?.nome_custom || '—'}
                  </td>
                  <td style={tdStyle}>
                    <Badge label={estado.label} color={estado.color} bg={estado.bg} />
                  </td>
                  <td style={{ ...tdStyle, color: C.muted }}>{formatDate(c.data_inicio)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatEur(sv?.valor_mensal)}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>
                    {sv ? periodicidadeLabel(sv.periodicidade, 'prestador') : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button onClick={() => onEditar(c)} style={{
                      background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.35rem',
                      padding: '0.2rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer',
                      color: C.navy, fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
                    }}>Editar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <HistoricoSection contratos={contratos} />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TabContratos({ condominioId, lojaId }) {
  const [contratos,        setContratos]        = useState([])
  const [servicosCatalogo, setServicosCatalogo] = useState([])
  const [prestadores,      setPrestadores]      = useState([])
  const [loading,          setLoading]          = useState(true)
  const [modal,            setModal]            = useState(null)
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
    } catch (e) { alert('Erro: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setLoadingGuardar(false) }
  }

  const contratosCondominio = contratos.filter(c => c.tipo === 'condominio')
  const contratosPrestador  = contratos.filter(c => c.tipo === 'prestador')

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
          Ímpar ({contratosCondominio.length})
        </button>
        <button style={secaoStyle(secao === 'prestador')} onClick={() => setSecao('prestador')}>
          Prestadores ({contratosPrestador.length})
        </button>
      </div>

      {/* Botão adicionar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={() => setModal({ tipo: secao })} style={{
          background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
          padding: '0.5rem 1.125rem', fontSize: '0.82rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}>+ {secao === 'condominio' ? 'Novo Contrato' : 'Novo Prestador'}</button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: C.subtle }}>⏳ A carregar…</div>
      ) : secao === 'condominio' ? (
        <TabelaContratosImpar
          contratos={contratosCondominio}
          onEditar={contrato => setModal({ tipo: 'condominio', contrato })}
        />
      ) : (
        <TabelaContratosPrestador
          contratos={contratosPrestador}
          onEditar={contrato => setModal({ tipo: 'prestador', contrato })}
        />
      )}

      {/* Modal */}
      {modal && (
        <ModalContrato
          tipo={modal.tipo}
          lojaId={lojaId}
          inicial={modal.contrato ? {
            tipo:                 modal.contrato.tipo,
            prestador_id:         modal.contrato.prestador_id             || '',
            prestador_nome:       modal.contrato.prestador_nome           || '',
            data_inicio:          modal.contrato.data_inicio?.slice(0, 10) || '',
            data_fim:             modal.contrato.data_fim?.slice(0, 10)    || '',
            estado:               modal.contrato.estado,
            renovacao_automatica: modal.contrato.renovacao_automatica,
            documento_url:        modal.contrato.documento_url             || '',
            condicoes:            modal.contrato.condicoes                 || '',
            servicos:             modal.contrato.servicos                  || [],
          } : null}
          condominioId={condominioId}
          prestadores={prestadores}
          servicosCatalogo={servicosCatalogo}
          contratosExistentes={contratos}
          onGuardar={handleGuardar}
          onFechar={() => setModal(null)}
          loading={loadingGuardar}
        />
      )}
    </div>
  )
}