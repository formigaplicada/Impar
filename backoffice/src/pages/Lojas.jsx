import { useState, useEffect } from 'react'
import { api } from '../lib/api'

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


// ── Resultado da sync por loja ────────────────────────────────────────────────

function ResultadoSync({ res, onFechar }) {
  if (!res) return null

  const { criados = 0, ligados = 0, ignorados = 0, detalhes = [], reason, error } = res

  if (!res.ok) {
    const msgs = {
      no_activos_folder: 'Loja sem pasta de activos configurada no OneDrive.',
      api_error:         `Erro na API do OneDrive: ${error || 'desconhecido'}`,
    }
    return (
      <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', background: C.redL, border: `1px solid #fca5a5`, borderRadius: '0.625rem', fontSize: '0.82rem', color: C.red }}>
        ❌ {msgs[reason] || 'Erro desconhecido.'}
      </div>
    )
  }

  const temDetalhes = detalhes.filter(d => d.resultado !== 'ignorado')

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Resumo */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: temDetalhes.length > 0 ? '0.875rem' : 0 }}>
        <Chip cor="green"  valor={criados}   label="criado"   />
        <Chip cor="blue"   valor={ligados}   label="ligado"   />
        <Chip cor="subtle" valor={ignorados} label="ignorado" />
      </div>

      {/* Detalhe das acções (criados + ligados) */}
      {temDetalhes.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0.625rem', overflow: 'hidden', fontSize: '0.78rem' }}>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7f9fc', borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ ...thSt, textAlign: 'left' }}>Pasta</th>
                  <th style={{ ...thSt }}>N Impar</th>
                  <th style={{ ...thSt }}>Acção</th>
                </tr>
              </thead>
              <tbody>
                {temDetalhes.map((d, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderL}`, background: i % 2 === 0 ? C.white : '#fafbfc' }}>
                    <td style={{ padding: '0.4rem 0.75rem', color: C.text }}>{d.pasta}</td>
                    <td style={{ padding: '0.4rem 0.75rem', textAlign: 'center', color: C.muted, fontWeight: 600 }}>{d.n_impar ?? '—'}</td>
                    <td style={{ padding: '0.4rem 0.75rem', textAlign: 'center' }}>
                      <ResultadoBadge resultado={d.resultado} motivo={d.motivo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {criados === 0 && ligados === 0 && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: C.subtle }}>Nenhuma alteração — tudo já estava sincronizado.</p>
      )}
    </div>
  )
}

function Chip({ cor, valor, label }) {
  const cores = {
    green:  { bg: C.greenL, color: C.green,  border: '#bbf7d0' },
    blue:   { bg: C.blueL,  color: C.blue,   border: '#bfdbfe' },
    subtle: { bg: '#f8fafc', color: C.subtle, border: C.border  },
  }
  const s = cores[cor] || cores.subtle
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: s.bg, border: `1px solid ${s.border}`, borderRadius: '0.5rem', padding: '0.25rem 0.625rem', fontSize: '0.78rem', color: s.color, fontWeight: 600 }}>
      <span style={{ fontSize: '1rem', fontWeight: 700 }}>{valor}</span>
      <span>{label}{valor !== 1 ? 's' : ''}</span>
    </div>
  )
}

function ResultadoBadge({ resultado, motivo }) {
  const map = {
    criado:   { bg: C.greenL,  color: C.green,  label: '✨ Criado'  },
    ligado:   { bg: C.blueL,   color: C.blue,   label: '🔗 Ligado'  },
    erro:     { bg: C.redL,    color: C.red,     label: '❌ Erro'    },
    ignorado: { bg: '#f8fafc', color: C.subtle,  label: '— Ignorado' },
  }
  const s = map[resultado] || map.ignorado
  return (
    <span title={motivo || ''} style={{ display: 'inline-block', background: s.bg, color: s.color, borderRadius: '0.375rem', padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 }}>
      {s.label}
    </span>
  )
}

const thSt = {
  padding: '0.4rem 0.75rem', fontWeight: 600, fontSize: '0.72rem',
  color: C.muted, letterSpacing: '0.03em', whiteSpace: 'nowrap', textAlign: 'center'
}


// ── Card de Loja ──────────────────────────────────────────────────────────────

function CardLoja({ loja }) {
  const [syncing,    setSyncing]    = useState(false)
  const [resultado,  setResultado]  = useState(null)
  const [expandido,  setExpandido]  = useState(false)

  async function handleSync() {
    setSyncing(true); setResultado(null); setExpandido(false)
    const res = await api.post(`/admin/lojas/${loja.id}/sync-onedrive`, {})
    setSyncing(false)
    setResultado(res)
    setExpandido(true)
  }

  const temPasta = !!loja.onedrive_activos_folder_id

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: '0.875rem', padding: '1.25rem 1.5rem',
      boxShadow: '0 1px 3px rgba(1,22,64,0.05)',
    }}>
      {/* Cabeçalho do card */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {loja.codigo && (
              <span style={{ background: C.navy, color: C.white, borderRadius: '0.3rem', padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: 700 }}>
                {loja.codigo}
              </span>
            )}
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
              {loja.nome}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {loja.gestor  && <span style={{ fontSize: '0.78rem', color: C.muted }}>👤 {loja.gestor}</span>}
            {loja.telefone && <span style={{ fontSize: '0.78rem', color: C.muted }}>📞 {loja.telefone}</span>}
            {loja.morada  && <span style={{ fontSize: '0.78rem', color: C.subtle }}>{loja.morada}</span>}
          </div>
          {/* Indicador pasta OneDrive */}
          <div style={{ marginTop: '0.5rem' }}>
            {temPasta
              ? <span style={{ fontSize: '0.72rem', color: C.green, fontWeight: 600 }}>✅ Pasta OneDrive configurada</span>
              : <span style={{ fontSize: '0.72rem', color: C.amber, fontWeight: 600 }}>⚠️ Sem pasta OneDrive configurada</span>
            }
          </div>
        </div>

        {/* Botão sync */}
        <button
          onClick={handleSync}
          disabled={syncing || !temPasta}
          title={!temPasta ? 'Loja sem pasta OneDrive configurada' : 'Sincronizar condomínios com OneDrive'}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            background: syncing ? C.border : (!temPasta ? '#f1f5f9' : C.navy),
            color: syncing ? C.muted : (!temPasta ? C.subtle : C.white),
            border: 'none', borderRadius: '0.5rem',
            padding: '0.5rem 1.125rem', fontSize: '0.82rem', fontWeight: 600,
            cursor: syncing || !temPasta ? 'default' : 'pointer',
            fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {syncing ? '⏳ A sincronizar…' : '🔄 Sincronizar'}
        </button>
      </div>

      {/* Resultado */}
      {resultado && expandido && (
        <ResultadoSync res={resultado} onFechar={() => setExpandido(false)} />
      )}
    </div>
  )
}


// ── Página principal ──────────────────────────────────────────────────────────

export default function Lojas() {
  const [lojas,   setLojas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro,  setFiltro]  = useState('')

  useEffect(() => {
    api.get('/lojas').then(data => {
      setLojas(data?.lojas || [])
      setLoading(false)
    })
  }, [])

  const lojasFiltradas = lojas.filter(l =>
    !filtro || l.nome.toLowerCase().includes(filtro.toLowerCase()) || l.codigo?.toLowerCase().includes(filtro.toLowerCase())
  )

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: C.text, fontFamily: 'DM Sans, sans-serif' }}>
            Lojas
          </h2>
          {!loading && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: C.subtle }}>
              {lojas.length} loja{lojas.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Filtro */}
        <input
          type="text"
          placeholder="Filtrar por nome ou código…"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={{
            padding: '0.45rem 0.875rem', border: `1.5px solid ${C.border}`,
            borderRadius: '0.5rem', fontSize: '0.875rem',
            fontFamily: 'DM Sans, sans-serif', color: C.text,
            background: C.white, width: '220px', outline: 'none',
          }}
        />
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
          <span style={{ display: 'block', fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</span>
          A carregar lojas…
        </div>
      ) : lojasFiltradas.length === 0 ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
          {filtro ? 'Nenhuma loja encontrada.' : 'Sem lojas activas.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {lojasFiltradas.map(loja => (
            <CardLoja key={loja.id} loja={loja} />
          ))}
        </div>
      )}
    </div>
  )
}
