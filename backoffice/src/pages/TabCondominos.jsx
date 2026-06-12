// ── TabCondominos ──────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import * as XLSX from 'xlsx'

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
  greenL:  '#dcfce7',
  red:     '#dc2626',
  redL:    '#fef2f2',
}

const PAPEIS = [
  { key: 'proprietario', label: 'Proprietário' },
  { key: 'arrendatario', label: 'Arrendatário' },
  { key: 'outro',        label: 'Outro' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  // Datas "desconhecidas" (1900-01-01)
  if (iso.startsWith('1900-01-01') || iso.startsWith('1900-01-01')) return '—'
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toInputDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function parseCPLocalidade(raw) {
  if (!raw) return { codigo_postal: '', localidade: '' }
  const m = String(raw).trim().match(/^(\d{4}-\d{3})\s+(.+)$/)
  return m ? { codigo_postal: m[1], localidade: m[2] } : { codigo_postal: String(raw).trim(), localidade: '' }
}

function PapelBadge({ papel }) {
  const cfg = {
    proprietario: { label: 'Proprietário', color: C.navy,  bg: '#e8edf5' },
    arrendatario: { label: 'Arrendatário', color: '#7c3aed', bg: '#ede9fe' },
    outro:        { label: 'Outro',        color: C.muted, bg: '#f1f5f9' },
  }[papel] || { label: papel, color: C.muted, bg: '#f1f5f9' }
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: '0.3rem', padding: '0.15rem 0.5rem',
      fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  )
}

// ── Estilos partilhados ───────────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${C.border}`,
  borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
  color: C.text, background: C.white, boxSizing: 'border-box',
}

const lbl = {
  fontSize: '0.72rem', fontWeight: 600, color: C.muted, marginBottom: '0.3rem',
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em',
}

const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }

// ── Modal Edição ──────────────────────────────────────────────────────────────

const FORM_CONDOMINO_VAZIO = {
  nome: '', nif: '', email: '', telefone: '', telemovel: '',
  morada: '', codigo_postal: '', localidade: '', pais: 'Portugal',
}

const FORM_FRACAO_VAZIO = {
  fracao: '', descricao_fracao: '', papel: 'proprietario',
  estado: 'ativo', data_aquisicao: '', data_venda: '',
  permilagem: '',
  morada_override: '', codigo_postal_override: '',
  localidade_override: '', pais_override: '',
}

function ModalEdicao({ registo, condominioId, onGuardar, onFechar, loading }) {
  // registo pode ser null (novo) ou { condomino, fracao }
  const [tabModal, setTabModal] = useState('condomino')
  const [formC, setFormC] = useState(registo?.condomino || { ...FORM_CONDOMINO_VAZIO })
  const [formF, setFormF] = useState(registo?.fracao ? {
    fracao:               registo.fracao.fracao || '',
    descricao_fracao:     registo.fracao.descricao_fracao || '',
    papel:                registo.fracao.papel || 'proprietario',
    estado:               registo.fracao.estado || 'ativo',
    data_aquisicao:       toInputDate(registo.fracao.data_aquisicao),
    data_venda:           toInputDate(registo.fracao.data_venda),
    permilagem:           registo.fracao.permilagem || '',
    morada_override:      registo.fracao.morada_override || '',
    codigo_postal_override: registo.fracao.codigo_postal_override || '',
    localidade_override:  registo.fracao.localidade_override || '',
    pais_override:        registo.fracao.pais_override || '',
  } : { ...FORM_FRACAO_VAZIO })

  const setC = (k, v) => setFormC(f => ({ ...f, [k]: v }))
  const setF = (k, v) => setFormF(f => ({ ...f, [k]: v }))

  const isNovo = !registo

  const tabStyle = (ativo) => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '0.5rem 1rem', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif',
    fontWeight: ativo ? 700 : 400, color: ativo ? C.navy : C.muted,
    borderBottom: ativo ? `2px solid ${C.navy}` : '2px solid transparent',
    marginBottom: '-1px',
  })

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            {isNovo ? 'Novo Condómino' : `Editar — ${registo.condomino.nome}`}
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: '1.5rem' }}>
          <button style={tabStyle(tabModal === 'condomino')} onClick={() => setTabModal('condomino')}>Condómino</button>
          <button style={tabStyle(tabModal === 'fracao')}    onClick={() => setTabModal('fracao')}>Fração</button>
        </div>

        {/* Tab Condómino */}
        {tabModal === 'condomino' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>Nome *</label>
              <input style={inp} value={formC.nome} onChange={e => setC('nome', e.target.value)} placeholder="Nome completo ou empresa" />
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>NIF</label>
                <input style={inp} value={formC.nif} onChange={e => setC('nif', e.target.value)} placeholder="000000000" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={formC.email} onChange={e => setC('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Telefone</label>
                <input style={inp} value={formC.telefone} onChange={e => setC('telefone', e.target.value)} placeholder="21 000 0000" />
              </div>
              <div>
                <label style={lbl}>Telemóvel</label>
                <input style={inp} value={formC.telemovel} onChange={e => setC('telemovel', e.target.value)} placeholder="91 000 0000" />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>Morada fiscal</label>
              <input style={inp} value={formC.morada} onChange={e => setC('morada', e.target.value)} placeholder="Rua, nº" />
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Código Postal</label>
                <input style={inp} value={formC.codigo_postal} onChange={e => setC('codigo_postal', e.target.value)} placeholder="0000-000" />
              </div>
              <div>
                <label style={lbl}>Localidade</label>
                <input style={inp} value={formC.localidade} onChange={e => setC('localidade', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>País</label>
              <input style={inp} value={formC.pais} onChange={e => setC('pais', e.target.value)} />
            </div>
          </div>
        )}

        {/* Tab Fração */}
        {tabModal === 'fracao' && (
          <div>
            <div style={row2}>
              <div>
                <label style={lbl}>Fração *</label>
                <input style={inp} value={formF.fracao} onChange={e => setF('fracao', e.target.value)} placeholder="A, B, AA…" />
              </div>
              <div>
                <label style={lbl}>Andar / Loja</label>
                <input style={inp} value={formF.descricao_fracao} onChange={e => setF('descricao_fracao', e.target.value)} placeholder="Hab.1, Cave…" />
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Papel</label>
                <select style={inp} value={formF.papel} onChange={e => setF('papel', e.target.value)}>
                  {PAPEIS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Estado</label>
                <select style={inp} value={formF.estado} onChange={e => setF('estado', e.target.value)}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Data de aquisição</label>
                <input type="date" style={inp} value={formF.data_aquisicao} onChange={e => setF('data_aquisicao', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Data de venda</label>
                <input type="date" style={inp} value={formF.data_venda} onChange={e => setF('data_venda', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={lbl}>Permilagem</label>
              <input type="number" step="0.01" min="0" style={inp} value={formF.permilagem} onChange={e => setF('permilagem', e.target.value)} placeholder="0.00" />
            </div>

            {/* Morada override */}
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: C.bg, borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ ...lbl, marginBottom: '0.75rem', color: C.subtle }}>Morada da fração (se diferente da fiscal)</p>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={lbl}>Morada</label>
                <input style={inp} value={formF.morada_override} onChange={e => setF('morada_override', e.target.value)} placeholder="Deixar vazio para usar morada fiscal" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={lbl}>Código Postal</label>
                  <input style={inp} value={formF.codigo_postal_override} onChange={e => setF('codigo_postal_override', e.target.value)} placeholder="0000-000" />
                </div>
                <div>
                  <label style={lbl}>Localidade</label>
                  <input style={inp} value={formF.localidade_override} onChange={e => setF('localidade_override', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>País</label>
                  <input style={inp} value={formF.pais_override} onChange={e => setF('pais_override', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button onClick={onFechar} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer',
            color: C.muted, fontFamily: 'DM Sans, sans-serif',
          }}>Cancelar</button>
          <button onClick={() => onGuardar({ condomino: formC, fracao: formF })}
            disabled={!formC.nome || !formF.fracao || loading}
            style={{
              background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
              padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: (!formC.nome || !formF.fracao || loading) ? 0.6 : 1,
            }}>{loading ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Import ──────────────────────────────────────────────────────────────

function ModalImport({ condominioId, onConcluido, onFechar }) {
  const [linhas, setLinhas]     = useState([])
  const [erro, setErro]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado] = useState(null)
  const inputRef = useRef()

  function handleFicheiro(e) {
    const file = e.target.files[0]
    if (!file) return
    setErro(''); setResultado(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        // Normalizar cabeçalhos
        const normalizado = raw.map(r => {
          const n = {}
          for (const [k, v] of Object.entries(r)) {
            const key = k.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9_]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '')
            n[key] = v
          }
          return {
            fracao:          n.fracao || n.fraccao || '',
            andar_loja:      n.andar_loja || n.andar___loja || '',
            nome:            n.nome || '',
            nif:             n.nif || '',
            morada:          n.morada || '',
            codigo_postal:   n.codigo_postal || n.cp || '',
            email:           n.email || '',
            telefone:        n.telefone || '',
            telemovel:       n.telemovel || n.telemovel_ || '',
            estado:          n.estado || 'Ativo',
          }
        }).filter(r => r.nome || r.fracao)
        setLinhas(normalizado)
      } catch {
        setErro('Erro ao ler o ficheiro. Confirma que é um .xlsx válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImportar() {
    if (linhas.length === 0) return
    setLoading(true)
    const res = await api.post('/condominos/import', {
      condominio_id: condominioId,
      rows: linhas,
    })
    setLoading(false)
    setResultado(res)
    if (res?.created > 0) onConcluido()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onFechar() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
    }}>
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 700,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            Importar Condóminos (.xlsx)
          </h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Upload */}
        {linhas.length === 0 && !resultado && (
          <div>
            <p style={{ fontSize: '0.82rem', color: C.muted, marginBottom: '1.25rem' }}>
              O ficheiro deve ter colunas: <strong>Fração, Andar / Loja, Nome, NIF, Morada, Código Postal, Estado, Email, Telefone, Telemóvel</strong>
            </p>
            <div onClick={() => inputRef.current?.click()} style={{
              border: `2px dashed ${C.border}`, borderRadius: '0.75rem',
              padding: '3rem', textAlign: 'center', cursor: 'pointer',
              color: C.muted, fontSize: '0.875rem',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.background = C.blueL }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
              Clica para selecionar o ficheiro .xlsx
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFicheiro} />
            {erro && <p style={{ marginTop: '0.75rem', color: C.red, fontSize: '0.82rem' }}>❌ {erro}</p>}
          </div>
        )}

        {/* Preview */}
        {linhas.length > 0 && !resultado && (
          <div>
            <p style={{ fontSize: '0.82rem', color: C.muted, marginBottom: '1rem' }}>
              {linhas.length} linha{linhas.length !== 1 ? 's' : ''} encontrada{linhas.length !== 1 ? 's' : ''}. Confirma antes de importar.
            </p>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: '0.75rem', overflow: 'hidden', marginBottom: '1.5rem' }}>
              <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f7f9fc', zIndex: 1 }}>
                    <tr>
                      {['Fração', 'Andar/Loja', 'Nome', 'Email', 'Telemóvel', 'Estado'].map(h => (
                        <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                        <td style={{ padding: '0.4rem 0.75rem', fontWeight: 700, color: C.navy }}>{l.fracao || '—'}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: C.muted }}>{l.andar_loja || '—'}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: C.text }}>{l.nome || '—'}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: C.muted }}>{l.email || '—'}</td>
                        <td style={{ padding: '0.4rem 0.75rem', color: C.muted }}>{l.telemovel || '—'}</td>
                        <td style={{ padding: '0.4rem 0.75rem' }}>
                          <span style={{
                            background: (l.estado || '').toLowerCase() === 'ativo' ? C.greenL : C.redL,
                            color: (l.estado || '').toLowerCase() === 'ativo' ? C.green : C.red,
                            borderRadius: '0.25rem', padding: '0.1rem 0.4rem',
                            fontSize: '0.68rem', fontWeight: 700,
                          }}>{l.estado || 'Ativo'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setLinhas([])} style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.82rem', cursor: 'pointer',
                color: C.muted, fontFamily: 'DM Sans, sans-serif',
              }}>← Escolher outro ficheiro</button>
              <button onClick={handleImportar} disabled={loading} style={{
                background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
                padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 600,
                cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif',
                opacity: loading ? 0.6 : 1,
              }}>{loading ? '⏳ A importar…' : `Importar ${linhas.length} registo${linhas.length !== 1 ? 's' : ''}`}</button>
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              {resultado.errors === 0 ? '✅' : resultado.created > 0 ? '⚠️' : '❌'}
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: C.navy, marginBottom: '0.5rem' }}>
              {resultado.created} criado{resultado.created !== 1 ? 's' : ''}
              {resultado.errors > 0 ? `, ${resultado.errors} com erro` : ''}
            </p>
            {resultado.details?.length > 0 && (
              <div style={{ textAlign: 'left', background: C.redL, border: `1px solid #fca5a5`, borderRadius: '0.5rem', padding: '0.75rem 1rem', marginTop: '1rem' }}>
                {resultado.details.map((d, i) => (
                  <p key={i} style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: C.red }}>
                    {d.row?.nome || d.row?.fracao || `Linha ${i + 1}`}: {d.error}
                  </p>
                ))}
              </div>
            )}
            <button onClick={onFechar} style={{
              marginTop: '1.5rem', background: C.navy, color: C.white, border: 'none',
              borderRadius: '0.5rem', padding: '0.5rem 1.5rem', fontSize: '0.875rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tabela ────────────────────────────────────────────────────────────────────

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

function TabelaCondominos({ condominos, onEditar }) {
  if (condominos.length === 0) return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.75rem',
      padding: '3rem', textAlign: 'center', color: C.subtle,
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏠</div>
      Sem condóminos registados.
    </div>
  )

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.875rem', overflow: 'hidden', boxShadow: '0 1px 4px rgba(1,22,64,0.06)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Fração</th>
              <th style={thStyle}>Andar / Loja</th>
              <th style={thStyle}>Papel</th>
              <th style={thStyle}>Condómino</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Telemóvel</th>
              <th style={thStyle}>Compra</th>
              <th style={thStyle}>Venda</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Permilagem</th>
              <th style={{ ...thStyle, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {condominos.map((r, i) => (
              <tr key={r.fracao_id} style={{ background: i % 2 === 0 ? C.white : '#fafbfc' }}
                onMouseEnter={e => e.currentTarget.style.background = C.blueL}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.white : '#fafbfc'}
              >
                <td style={{ ...tdStyle, fontWeight: 700, color: C.navy }}>{r.fracao}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{r.descricao_fracao || '—'}</td>
                <td style={tdStyle}><PapelBadge papel={r.papel} /></td>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{r.nome}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{r.email || '—'}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{r.telemovel || '—'}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{formatDate(r.data_aquisicao)}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{formatDate(r.data_venda)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: C.muted }}>
                  {r.permilagem != null && r.permilagem !== '' ? Number(r.permilagem).toFixed(2) : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <button onClick={() => onEditar(r)} style={{
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
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TabCondominos({ condominioId }) {
  const [condominos,     setCondominos]     = useState([])
  const [loading,        setLoading]        = useState(true)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [modal,          setModal]          = useState(null)   // null | 'novo' | { condomino, fracao }
  const [modalImport,    setModalImport]    = useState(false)
  const [loadingGuardar, setLoadingGuardar] = useState(false)

  async function carregar() {
    setLoading(true)
    const data = await api.get(`/condominos/por-condominio/${condominioId}`)
    setCondominos(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [condominioId])

  const lista = condominos.filter(r => mostrarInativos ? true : r.estado === 'ativo')
  const nInativos = condominos.filter(r => r.estado === 'inativo').length

  async function handleGuardar({ condomino, fracao }) {
    setLoadingGuardar(true)
    try {
      if (modal === 'novo') {
        // Criar condómino novo
        const novoC = await api.post('/condominos', condomino)
        if (!novoC?.id) throw new Error(novoC?.error || 'Erro ao criar condómino')
        // Associar fração
        await api.post(`/condominos/${novoC.id}/fracoes`, {
          ...fracao,
          condominio_id: condominioId,
          data_aquisicao: fracao.data_aquisicao || '1900-01-01',
        })
      } else {
        // Editar condómino existente
        await api.put(`/condominos/${modal.id}`, condomino)
        // Editar fração
        await api.put(`/condominos/${modal.id}/fracoes/${modal.fracao_id}`, fracao)
      }
      await carregar()
      setModal(null)
    } catch (e) {
      alert('Erro: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoadingGuardar(false)
    }
  }

  function abrirEdicao(r) {
    // r tem campos planos da query por-condominio
    setModal({
      id:        r.id,
      fracao_id: r.fracao_id,
      condomino: {
        nome:          r.nome,
        nif:           r.nif           || '',
        email:         r.email         || '',
        telefone:      r.telefone      || '',
        telemovel:     r.telemovel     || '',
        morada:        r.morada        || '',
        codigo_postal: r.codigo_postal || '',
        localidade:    r.localidade    || '',
        pais:          r.pais          || 'Portugal',
      },
      fracao: {
        fracao:                 r.fracao,
        descricao_fracao:       r.descricao_fracao       || '',
        papel:                  r.papel                  || 'proprietario',
        estado:                 r.estado                 || 'ativo',
        data_aquisicao:         r.data_aquisicao         || '',
        data_venda:             r.data_venda             || '',
        permilagem:             r.permilagem             || '',
        morada_override:        r.morada_override        || '',
        codigo_postal_override: r.codigo_postal_override || '',
        localidade_override:    r.localidade_override    || '',
        pais_override:          r.pais_override          || '',
      },
    })
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.82rem', color: C.muted }}>
            {lista.length} condómino{lista.length !== 1 ? 's' : ''}
            {!mostrarInativos && nInativos > 0 && (
              <span style={{ color: C.subtle }}> · {nInativos} inativo{nInativos !== 1 ? 's' : ''}</span>
            )}
          </span>
          {nInativos > 0 && (
            <button onClick={() => setMostrarInativos(v => !v)} style={{
              background: mostrarInativos ? '#f1f5f9' : 'none',
              border: `1px solid ${C.border}`, borderRadius: '0.375rem',
              padding: '0.25rem 0.625rem', fontSize: '0.75rem', cursor: 'pointer',
              color: C.muted, fontFamily: 'DM Sans, sans-serif',
            }}>
              {mostrarInativos ? 'Ocultar inativos' : 'Ver inativos'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setModalImport(true)} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600,
            cursor: 'pointer', color: C.navy, fontFamily: 'DM Sans, sans-serif',
            display: 'flex', alignItems: 'center', gap: '0.375rem',
          }}>📊 Importar xlsx</button>
          <button onClick={() => setModal('novo')} style={{
            background: C.navy, color: C.white, border: 'none', borderRadius: '0.5rem',
            padding: '0.5rem 1.125rem', fontSize: '0.82rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}>+ Adicionar</button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: C.subtle }}>⏳ A carregar…</div>
      ) : (
        <TabelaCondominos condominos={lista} onEditar={abrirEdicao} />
      )}

      {/* Modal edição / novo */}
      {modal && (
        <ModalEdicao
          registo={modal === 'novo' ? null : modal}
          condominioId={condominioId}
          onGuardar={handleGuardar}
          onFechar={() => setModal(null)}
          loading={loadingGuardar}
        />
      )}

      {/* Modal import */}
      {modalImport && (
        <ModalImport
          condominioId={condominioId}
          onConcluido={() => carregar()}
          onFechar={() => setModalImport(false)}
        />
      )}
    </div>
  )
}
