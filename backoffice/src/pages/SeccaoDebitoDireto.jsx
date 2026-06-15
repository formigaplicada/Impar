// ── SeccaoDebitoDireto ────────────────────────────────────────────────────────
// Encaixa na tab "Info. Financeira" do painel de condomínio,
// na secção DÉBITO DIRECTO existente.
// Props: condominioId, condominioNome, condominioMorada, condominioCp, condominioCidade
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { api } from '../lib/api'

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
  green:   '#16a34a',
  greenL:  '#dcfce7',
  red:     '#dc2626',
  redL:    '#fef2f2',
  amber:   '#d97706',
  amberL:  '#fef3c7',
}

const inp = {
  width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${C.border}`,
  borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
  color: C.text, background: C.white, boxSizing: 'border-box',
}

const lbl = {
  fontSize: '0.72rem', fontWeight: 600, color: C.muted, marginBottom: '0.3rem',
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em',
}

const row2 = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatIBAN(v) {
  if (!v) return '—'
  return v.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}

function EstadoBadge({ estado }) {
  const cfg = {
    activo:   { label: 'Activo',   color: C.green,  bg: C.greenL },
    pendente: { label: 'Pendente', color: C.amber,  bg: C.amberL },
    expirado: { label: 'Expirado', color: C.red,    bg: C.redL   },
    cancelado:{ label: 'Cancelado',color: C.muted,  bg: '#f1f5f9'},
  }[estado] || { label: estado, color: C.muted, bg: '#f1f5f9' }

  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: '0.3rem', padding: '0.15rem 0.55rem',
      fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  )
}

// ── Modal: Criar mandato DD ───────────────────────────────────────────────────

function ModalCriarMandato({ condominioId, condominioNome, condominioIban = '', onCriado, onFechar }) {
  const [form, setForm] = useState({
    nome_devedor:  condominioNome || '',
    email_devedor: '',
    iban:          condominioIban || '',
  })
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.nome_devedor.trim()) return setErro('Introduza o nome do representante.')
    if (!form.email_devedor.trim() || !form.email_devedor.includes('@'))
      return setErro('Introduza um email válido.')

    setErro('')
    setLoading(true)
    try {
      // Gerar referência ADC
      const adc = `IMPAR-${condominioId}-${Date.now()}`

      const res = await api.post('/dd/mandatos/create', {
        condominio_id: String(condominioId),
        iban: condominioIban.replace(/\s/g, '') || '',
        nome_devedor:  form.nome_devedor.trim(),
        email_devedor: form.email_devedor.trim(),
        iban:          form.iban.replace(/\s/g, '') || '',
        adc,
      })

      if (res?.error) throw new Error(res.error)
      onCriado(res)
    } catch (e) {
      setErro(e.message || 'Erro ao criar mandato. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
    >
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto', padding: '2rem',
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
              Gerar Autorização DD
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: C.muted }}>
              Será enviado um link de assinatura por email
            </p>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}>×</button>
        </div>

        {/* Form */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Nome do representante *</label>
          <input
            style={inp}
            value={form.nome_devedor}
            onChange={e => set('nome_devedor', e.target.value)}
            placeholder="Nome do administrador ou representante legal"
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>Email *</label>
          <input
            style={inp}
            type="email"
            value={form.email_devedor}
            onChange={e => set('email_devedor', e.target.value)}
            placeholder="email@condominio.pt"
          />
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: C.subtle }}>
            O link de assinatura será enviado para este endereço
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={lbl}>IBAN</label>
          <input
            style={{ ...inp, fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: '0.5px' }}
            value={form.iban}
            onChange={e => {
              const clean = e.target.value.replace(/\s/g, '').toUpperCase()
              set('iban', clean.replace(/(.{4})/g, '$1 ').trim())
            }}
            placeholder="PT50 0000 0000 0000 0000 0000 0"
            maxLength={29}
          />
        </div>

        {/* Info box */}
        <div style={{
          background: '#f0f4ff', border: `1px solid #c7d2fe`,
          borderRadius: '0.5rem', padding: '0.875rem 1rem', marginBottom: '1.25rem',
          fontSize: '0.78rem', color: C.navy, lineHeight: 1.5,
        }}>
          <strong>O que acontece a seguir:</strong>
          <ol style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
            <li>O cliente recebe um email com link seguro</li>
            <li>Preenche/confirma o IBAN e assina digitalmente</li>
            <li>O PDF do mandato SEPA é gerado e guardado no SharePoint</li>
            <li>O estado aqui atualiza para <strong>Activo</strong></li>
          </ol>
        </div>

        {erro && (
          <div style={{
            background: C.redL, border: `1px solid #fca5a5`, borderRadius: '0.5rem',
            padding: '0.625rem 0.875rem', marginBottom: '1rem',
            fontSize: '0.8rem', color: C.red,
          }}>
            {erro}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button onClick={onFechar} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
            padding: '0.5rem 1.25rem', fontSize: '0.875rem', cursor: 'pointer',
            color: C.muted, fontFamily: 'DM Sans, sans-serif',
          }}>Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: C.navy, color: C.lime, border: 'none', borderRadius: '0.5rem',
              padding: '0.5rem 1.5rem', fontSize: '0.875rem', fontWeight: 700,
              cursor: loading ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif',
              opacity: loading ? 0.6 : 1, letterSpacing: '0.01em',
            }}
          >
            {loading ? '⏳ A enviar…' : 'Enviar link de assinatura'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Link gerado ────────────────────────────────────────────────────────

function ModalLinkGerado({ link, adc, email, onFechar }) {
  const [copiado, setCopiado] = useState(false)

  function copiar() {
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(1,22,64,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
    >
      <div style={{
        background: C.white, borderRadius: '1rem', width: '100%', maxWidth: 480,
        padding: '2rem', boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, background: C.greenL, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem', fontSize: '1.5rem',
        }}>✉️</div>

        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
          Link enviado com sucesso
        </h2>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.82rem', color: C.muted, lineHeight: 1.5 }}>
          O email com o link de assinatura foi enviado para <strong style={{ color: C.navy }}>{email}</strong>.
          <br />ADC: <span style={{ fontFamily: 'monospace', color: C.navy }}>{adc}</span>
        </p>

        {/* Link copiável */}
        <div style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: '0.5rem',
          padding: '0.625rem 0.875rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          <span style={{
            flex: 1, fontSize: '0.72rem', color: C.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textAlign: 'left', fontFamily: 'monospace',
          }}>{link}</span>
          <button onClick={copiar} style={{
            background: copiado ? C.greenL : C.navy,
            color: copiado ? C.green : C.white,
            border: 'none', borderRadius: '0.35rem',
            padding: '0.3rem 0.75rem', fontSize: '0.72rem', fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
            transition: 'all 0.15s',
          }}>{copiado ? '✓ Copiado' : 'Copiar'}</button>
        </div>

        <p style={{ fontSize: '0.72rem', color: C.subtle, marginBottom: '1.5rem' }}>
          O link é válido por 7 dias. Pode também enviá-lo manualmente por WhatsApp.
        </p>

        <button onClick={onFechar} style={{
          background: C.navy, color: C.lime, border: 'none', borderRadius: '0.5rem',
          padding: '0.625rem 1.5rem', fontSize: '0.875rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}>Fechar</button>
      </div>
    </div>
  )
}

// ── Painel mandato activo ─────────────────────────────────────────────────────

function PainelMandato({ mandato, onNovoMandato }) {
  const isActivo = mandato.estado === 'activo'

  return (
    <div style={{
      border: `1px solid ${isActivo ? '#bbf7d0' : C.border}`,
      borderRadius: '0.75rem',
      background: isActivo ? '#f0fdf4' : C.surface,
      padding: '1.25rem 1.5rem',
    }}>
      {/* Header do mandato */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 36, height: 36, background: isActivo ? C.greenL : C.amberL,
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '1rem', flexShrink: 0,
          }}>
            {isActivo ? '✓' : '⏳'}
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
              Mandato SEPA Core DD
            </div>
            <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: '0.15rem', fontFamily: 'monospace' }}>
              ADC: {mandato.adc}
            </div>
          </div>
        </div>
        <EstadoBadge estado={mandato.estado} />
      </div>

      {/* Dados */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <div style={lbl}>IBAN</div>
          <div style={{ fontSize: '0.82rem', color: C.text, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {formatIBAN(mandato.iban)}
          </div>
        </div>
        <div>
          <div style={lbl}>Representante</div>
          <div style={{ fontSize: '0.82rem', color: C.text }}>{mandato.nome_devedor || '—'}</div>
        </div>
        <div>
          <div style={lbl}>{isActivo ? 'Assinado em' : 'Criado em'}</div>
          <div style={{ fontSize: '0.82rem', color: C.text }}>
            {isActivo ? formatDate(mandato.signed_at) : formatDate(mandato.criado_em)}
          </div>
        </div>
      </div>

      {/* PDF link */}
      {mandato.pdf_url && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={lbl}>Documento</div>
          <a
            href={mandato.pdf_url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.78rem', color: C.blue, fontFamily: 'DM Sans, sans-serif',
              textDecoration: 'none', fontWeight: 600,
            }}
          >
            📄 Mandato_DD_{mandato.adc}.pdf
            <span style={{ fontSize: '0.65rem', color: C.subtle }}>↗ SharePoint</span>
          </a>
        </div>
      )}

      {/* Pendente: link de assinatura */}
      {mandato.estado === 'pendente' && mandato.token && (
        <div style={{
          background: C.amberL, border: `1px solid #fcd34d`,
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          fontSize: '0.78rem', color: '#92400e', marginBottom: '1rem',
        }}>
          <strong>Aguarda assinatura.</strong> O link foi enviado para <strong>{mandato.email_devedor}</strong>.
          {mandato.token_expires_at && (
            <span> Válido até {formatDate(mandato.token_expires_at)}.</span>
          )}
        </div>
      )}

      {/* Expirado */}
      {mandato.estado === 'expirado' && (
        <div style={{
          background: C.redL, border: `1px solid #fca5a5`,
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          fontSize: '0.78rem', color: C.red, marginBottom: '1rem',
        }}>
          Este link expirou sem ser assinado.
        </div>
      )}

      {/* Acções */}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        {mandato.estado !== 'activo' && (
          <button
            onClick={onNovoMandato}
            style={{
              background: C.navy, color: C.lime, border: 'none', borderRadius: '0.5rem',
              padding: '0.4rem 1rem', fontSize: '0.78rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Reenviar link
          </button>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SeccaoDebitoDireto({ condominioId, condominioNome, condominioIban = '' }) {
  const [mandatos,      setMandatos]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [modalCriar,    setModalCriar]    = useState(false)
  const [modalLink,     setModalLink]     = useState(null)  // { link, adc, email }

  async function carregar() {
    setLoading(true)
    try {
      const data = await api.get(`/condominios/${condominioId}/financeiro`)
      setMandatos(Array.isArray(data?.historico) ? data.historico : [])
    } catch {
      setMandatos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [condominioId])

  function handleCriado(res) {
    setModalCriar(false)
    setModalLink({ link: res.link, adc: res.adc || '', email: res.email || '' })
    carregar()
  }

  // Mandato mais recente (activo ou pendente)
  const mandatoActivo   = mandatos.find(m => m.estado === 'activo')
  const mandatoPendente = mandatos.find(m => m.estado === 'pendente')
  const mandatoMostrar  = mandatoActivo || mandatoPendente || mandatos[0]
  const semMandato      = mandatos.length === 0

  return (
    <>
      {/* Cabeçalho da secção (estilo igual ao "DÉBITO DIRECTO" existente) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: C.subtle,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Débito Directo
        </span>
        {!semMandato && !mandatoActivo && (
          <button
            onClick={() => setModalCriar(true)}
            style={{
              background: C.navy, color: C.lime, border: 'none', borderRadius: '0.5rem',
              padding: '0.35rem 0.875rem', fontSize: '0.75rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Gerar autorização
          </button>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: C.subtle, fontSize: '0.82rem' }}>
          ⏳ A carregar…
        </div>
      ) : semMandato ? (
        /* Estado vazio */
        <div style={{
          textAlign: 'center', padding: '2.5rem 1rem',
          border: `2px dashed ${C.border}`, borderRadius: '0.75rem',
          background: C.bg,
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏦</div>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.82rem', color: C.muted, lineHeight: 1.5 }}>
            Sem mandato DD configurado.<br />
            <span style={{ fontSize: '0.75rem', color: C.subtle }}>
              Gere uma autorização para enviar ao condomínio assinar digitalmente.
            </span>
          </p>
          <button
            onClick={() => setModalCriar(true)}
            style={{
              background: C.navy, color: C.lime, border: 'none', borderRadius: '0.5rem',
              padding: '0.6rem 1.375rem', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Gerar autorização DD
          </button>
        </div>
      ) : (
        /* Mandato existente */
        <div>
          <PainelMandato
            mandato={mandatoMostrar}
            onNovoMandato={() => setModalCriar(true)}
          />

          {/* Histórico (se houver mais de 1) */}
          {mandatos.length > 1 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ ...lbl, marginBottom: '0.5rem' }}>Histórico</div>
              {mandatos.filter(m => m.id !== mandatoMostrar.id).map(m => (
                <div key={m.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0.75rem', border: `1px solid ${C.borderL}`,
                  borderRadius: '0.5rem', marginBottom: '0.5rem', background: C.bg,
                }}>
                  <span style={{ fontSize: '0.75rem', color: C.muted, fontFamily: 'monospace' }}>
                    {m.adc}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: C.subtle }}>{formatDate(m.criado_em)}</span>
                    <EstadoBadge estado={m.estado} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {modalCriar && (
       <ModalCriarMandato
          condominioId={condominioId}
          condominioNome={condominioNome}
          condominioIban={condominioIban}
          onCriado={handleCriado}
          onFechar={() => setModalCriar(false)}
        />
      )}

      {modalLink && (
        <ModalLinkGerado
          link={modalLink.link}
          adc={modalLink.adc}
          email={modalLink.email}
          onFechar={() => { setModalLink(null) }}
        />
      )}
    </>
  )
}
