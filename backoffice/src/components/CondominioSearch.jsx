import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

// ── Paleta (partilhada com o resto do backoffice) ─────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// CondominioSearch
//
// Props:
//   value         — { id, n_impar, nome } | null   (condomínio seleccionado)
//   onChange      — (condominio | null) => void
//   placeholder   — string (opcional)
//
// Comportamento:
//   - Campo de texto aceita n_impar
//   - Botão 🔍 faz lookup:
//       • exact match por n_impar → selecciona directamente
//       • sem match ou input vazio → abre modal de pesquisa
//   - No modal: pesquisa por n_impar, nome ou morada (mínimo 2 chars)
//   - Botão ✕ limpa a selecção
// ─────────────────────────────────────────────────────────────────────────────

export default function CondominioSearch({ value, onChange, placeholder }) {
  const [inputVal,      setInputVal]      = useState('')
  const [modalAberto,   setModalAberto]   = useState(false)
  const [pesquisa,      setPesquisa]      = useState('')
  const [resultados,    setResultados]    = useState([])
  const [loadingBusca,  setLoadingBusca]  = useState(false)
  const [erroBusca,     setErroBusca]     = useState(null)
  const inputRef = useRef(null)

  // Quando o valor externo muda (ex: ao editar um evento existente),
  // sincronizar o input com o n_impar
  useEffect(() => {
    if (value?.n_impar) setInputVal(String(value.n_impar))
    else if (!value)    setInputVal('')
  }, [value])

  // ── Pesquisa no modal ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!modalAberto) return
    if (pesquisa.trim().length < 2) { setResultados([]); return }

    const timeout = setTimeout(async () => {
      setLoadingBusca(true)
      setErroBusca(null)
      try {
        const isNumerico = /^\d+$/.test(pesquisa.trim())
        const params     = new URLSearchParams()
        if (isNumerico) params.set('n_impar', pesquisa.trim())
        else            params.set('nome',    pesquisa.trim())

        const data = await api.get(`/condominios?${params}`)
        setResultados(data.condominios || [])
      } catch (e) {
        setErroBusca(e.message)
      } finally {
        setLoadingBusca(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [pesquisa, modalAberto])

  // ── Lookup directo por n_impar (botão 🔍 ou Enter) ────────────────────────
  async function handleBuscar() {
    const val = inputVal.trim()

    // Se já há condomínio seleccionado e o input não mudou, abre o modal
    if (value && String(value.n_impar) === val) {
      abrirModal()
      return
    }

    // Se campo vazio → abre modal
    if (!val) { abrirModal(); return }

    // Tentar exact match
    setLoadingBusca(true)
    try {
      const data = await api.get(`/condominios?n_impar=${encodeURIComponent(val)}`)
      const lista = data.condominios || []

      if (lista.length === 1) {
        // Exact match único — selecciona directamente
        seleccionar(lista[0])
      } else {
        // Sem match ou múltiplos → abre modal com o valor já preenchido
        abrirModal(val)
      }
    } catch {
      abrirModal(val)
    } finally {
      setLoadingBusca(false)
    }
  }

  function abrirModal(termInicial = '') {
    setPesquisa(termInicial)
    setResultados([])
    setModalAberto(true)
  }

  function seleccionar(cond) {
    onChange({ id: cond.id, n_impar: cond.n_impar, nome: cond.nome })
    setInputVal(String(cond.n_impar))
    setModalAberto(false)
  }

  function limpar() {
    onChange(null)
    setInputVal('')
    inputRef.current?.focus()
  }

  const inp = {
    padding: '0.5rem 0.75rem',
    border: `1px solid ${C.border}`,
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontFamily: 'DM Sans, sans-serif',
    color: C.text,
    background: C.white,
    boxSizing: 'border-box',
  }

  return (
    <>
      {/* ── Campo principal ── */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
        {value ? (
          // Condomínio seleccionado — mostra pill com nome
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            background: '#eff6ff', border: `1px solid #bfdbfe`,
            borderRadius: '0.5rem', fontSize: '0.875rem', color: C.navy,
          }}>
            <span>
              <strong>{value.n_impar}</strong>
              <span style={{ color: C.muted, marginLeft: '0.5rem', fontSize: '0.82rem' }}>{value.nome}</span>
            </span>
            <button
              type="button"
              onClick={limpar}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.muted, fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem',
              }}
              title="Remover condomínio"
            >✕</button>
          </div>
        ) : (
          // Sem selecção — input para n_impar
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            style={{ ...inp, flex: 1, width: 0 }}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBuscar() } }}
            placeholder={placeholder || 'Nº Ímpar (ou 🔍 para pesquisar)'}
          />
        )}

        <button
          type="button"
          onClick={value ? abrirModal : handleBuscar}
          disabled={loadingBusca}
          style={{
            background: C.navy, color: C.white, border: 'none',
            borderRadius: '0.5rem', padding: '0 0.875rem',
            cursor: loadingBusca ? 'wait' : 'pointer',
            fontSize: '1rem', flexShrink: 0,
            opacity: loadingBusca ? 0.7 : 1,
          }}
          title="Pesquisar condomínio"
        >
          {loadingBusca ? '⏳' : '🔍'}
        </button>
      </div>

      {/* ── Modal de pesquisa ── */}
      {modalAberto && (
        <ModalPesquisa
          pesquisa={pesquisa}
          setPesquisa={setPesquisa}
          resultados={resultados}
          loading={loadingBusca}
          erro={erroBusca}
          onSeleccionar={seleccionar}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de pesquisa
// ─────────────────────────────────────────────────────────────────────────────
function ModalPesquisa({ pesquisa, setPesquisa, resultados, loading, erro, onSeleccionar, onFechar }) {
  const inputRef = useRef(null)

  useEffect(() => {
    // Foco automático no campo de pesquisa ao abrir
    setTimeout(() => inputRef.current?.focus(), 50)

    const handler = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onFechar])

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
        width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(1,22,64,0.25)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '80vh',
      }}>
        {/* Cabeçalho */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem', borderBottom: `1px solid ${C.border}`,
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.navy, fontFamily: 'DM Sans, sans-serif' }}>
            Pesquisar condomínio
          </h3>
          <button
            onClick={onFechar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: C.muted }}
          >×</button>
        </div>

        {/* Campo de pesquisa */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${C.borderL}` }}>
          <input
            ref={inputRef}
            type="text"
            value={pesquisa}
            onChange={e => setPesquisa(e.target.value)}
            placeholder="Pesquisar por nº Ímpar, nome ou morada…"
            style={{
              width: '100%', padding: '0.6rem 0.875rem',
              border: `1.5px solid ${C.border}`, borderRadius: '0.5rem',
              fontSize: '0.875rem', fontFamily: 'DM Sans, sans-serif',
              color: C.text, boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: C.subtle }}>
            Mínimo 2 caracteres para pesquisar
          </p>
        </div>

        {/* Resultados */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
              A pesquisar…
            </div>
          )}

          {erro && (
            <div style={{ padding: '1rem 1.5rem', color: '#dc2626', fontSize: '0.82rem' }}>
              Erro: {erro}
            </div>
          )}

          {!loading && !erro && pesquisa.trim().length >= 2 && resultados.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: C.subtle, fontSize: '0.875rem' }}>
              Nenhum condomínio encontrado.
            </div>
          )}

          {!loading && resultados.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSeleccionar(c)}
              style={{
                width: '100%', background: 'none', border: 'none',
                padding: '0.875rem 1.5rem',
                borderBottom: i < resultados.length - 1 ? `1px solid ${C.borderL}` : 'none',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'DM Sans, sans-serif',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '1rem',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.bg}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: C.text, marginBottom: '0.15rem' }}>
                  {c.nome}
                </div>
                {c.morada && (
                  <div style={{ fontSize: '0.75rem', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.morada}
                  </div>
                )}
              </div>
              <div style={{
                flexShrink: 0,
                background: '#eff6ff', color: '#2563eb',
                borderRadius: '0.3rem', padding: '0.15rem 0.5rem',
                fontSize: '0.78rem', fontWeight: 700,
              }}>
                {c.n_impar}
              </div>
            </button>
          ))}
        </div>

        {/* Rodapé — opção texto livre */}
        <div style={{
          padding: '0.875rem 1.5rem',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.75rem', color: C.subtle }}>
            Não encontras? Podes deixar em branco e usar texto livre no formulário.
          </span>
          <button
            type="button"
            onClick={onFechar}
            style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: '0.5rem',
              padding: '0.35rem 0.875rem', fontSize: '0.8rem', cursor: 'pointer',
              color: C.muted, fontFamily: 'DM Sans, sans-serif',
            }}
          >Fechar</button>
        </div>
      </div>
    </div>
  )
}
