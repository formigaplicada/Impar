import { useState } from 'react'
import { pdf, Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { api } from '../lib/api'

// ── Registar fonte Yanone Kaffeesatz ──────────────────────────────────────────
Font.register({
  family: 'Yanone',
  fonts: [
    {
      src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/yanonekaffeesatz/YanoneKaffeesatz%5Bwght%5D.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/yanonekaffeesatz/YanoneKaffeesatz%5Bwght%5D.ttf',
      fontWeight: 700,
    },
  ]
})

// ── Cores ─────────────────────────────────────────────────────────────────────
const verde       = '#2D5A27'
const verdeClaro  = '#4A8C3F'
const verdeBorda  = '#8BC34A'
const cinzaEscuro = '#1E293B'
const cinzaMedio  = '#64748B'
const bgVerde     = '#EBF5E9'
const branco      = '#FFFFFF'
const navy        = '#011640'

const LOGO_URL = 'https://www.impar.pt/wp-content/uploads/2025/01/logo-impar-2048x807.png'

// ── Estilos ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Yanone',
    backgroundColor: branco,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    borderWidth: 3,
    borderColor: verdeBorda,
  },

  // Cabeçalho
  header: {
    backgroundColor: bgVerde,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: verdeBorda,
  },
  logo: {
    width: 90,
    height: 35,
    objectFit: 'contain',
  },
  headerTitulo: {
    fontSize: 24,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
  },

  // Morada principal
  moradaSection: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: branco,
  },
  moradaNome: {
    fontSize: 22,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 3,
  },
  moradaDetalhe: {
    fontSize: 13,
    color: cinzaMedio,
    fontFamily: 'Yanone',
  },

  // Corpo
  body: {
    paddingHorizontal: 28,
    paddingTop: 14,
    paddingBottom: 14,
    flex: 1,
  },

  // Grid de dois blocos
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 5,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitulo: {
    fontSize: 9,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 11,
    color: cinzaMedio,
    fontFamily: 'Yanone',
    flex: 1,
  },
  cardValue: {
    fontSize: 11,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    flex: 2,
    textAlign: 'right',
  },

  // Seccao loja
  lojaSection: {
    marginBottom: 14,
    backgroundColor: bgVerde,
    borderRadius: 5,
    padding: 14,
    borderWidth: 1,
    borderColor: verdeBorda,
  },
  lojaSectionTitulo: {
    fontSize: 9,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  lojaFotos: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  lojaFoto: {
    flex: 1,
    height: 110,
    borderRadius: 4,
    objectFit: 'cover',
    borderWidth: 1,
    borderColor: verdeBorda,
  },
  lojaNome: {
    fontSize: 16,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 2,
    textAlign: 'center',
  },
  lojaDetalhe: {
    fontSize: 12,
    color: cinzaMedio,
    fontFamily: 'Yanone',
    textAlign: 'center',
    marginBottom: 2,
  },
  lojaContacto: {
    fontSize: 12,
    color: verde,
    fontFamily: 'Yanone',
    textAlign: 'center',
  },

  // Gestor
  gestorSection: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  gestorTitulo: {
    fontSize: 9,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  gestorNome: {
    fontSize: 16,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 3,
    textAlign: 'center',
  },
  gestorContacto: {
    fontSize: 12,
    color: verde,
    fontFamily: 'Yanone',
    textAlign: 'center',
    marginBottom: 2,
  },

  // QR + App
  appSection: {
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: bgVerde,
    borderRadius: 5,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: verdeBorda,
  },
  appTitulo: {
    fontSize: 11,
    fontWeight: 700,
    color: verde,
    fontFamily: 'Yanone',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qrImage: {
    width: 100,
    height: 100,
    marginBottom: 6,
  },
  appSub: {
    fontSize: 10,
    color: cinzaMedio,
    fontFamily: 'Yanone',
    textAlign: 'center',
  },

  // Rodape
  footer: {
    backgroundColor: navy,
    paddingVertical: 9,
    paddingHorizontal: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: branco,
    fontFamily: 'Yanone',
  },
})

// ── Documento PDF ─────────────────────────────────────────────────────────────

function FichaPDF({ dados, qrDataUrl }) {
  const d = dados

  const Row = ({ label, value }) => value ? (
    <View style={S.cardRow}>
      <Text style={S.cardLabel}>{label}</Text>
      <Text style={S.cardValue}>{String(value)}</Text>
    </View>
  ) : null

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Cabecalho */}
        <View style={S.header}>
          <Image src={LOGO_URL} style={S.logo} />
          <Text style={S.headerTitulo}>Ficha do Condominio</Text>
        </View>

        {/* Morada principal */}
        <View style={S.moradaSection}>
          <Text style={S.moradaNome}>{d.nome}</Text>
          {d.morada && (
            <Text style={S.moradaDetalhe}>
              {d.morada}{d.codigo_postal ? `  ·  ${d.codigo_postal}` : ''}
            </Text>
          )}
        </View>

        {/* Corpo */}
        <View style={S.body}>

          {/* Grid: Identificacao + Contactos */}
          <View style={S.grid}>
            <View style={S.card}>
              <Text style={S.cardTitulo}>Identificacao</Text>
              <Row label="N. Impar" value={d.n_impar} />
              <Row label="N. Fracoes" value={d.n_fracoes} />
              <Row label="IBAN" value={d.iban} />
            </View>
            <View style={S.card}>
              <Text style={S.cardTitulo}>Contactos</Text>
              <Row label="Telefone" value={d.telefone} />
              <Row label="Telemovel" value={d.telemovel} />
              <Row label="Telefone 2" value={d.telefone2} />
            </View>
          </View>

          {/* Loja de suporte */}
          <View style={S.lojaSection}>
            <Text style={S.lojaSectionTitulo}>A Sua Loja de Suporte</Text>

            {(d.loja_foto1 || d.loja_foto2) && (
              <View style={S.lojaFotos}>
                {d.loja_foto1 && <Image src={d.loja_foto1} style={S.lojaFoto} />}
                {d.loja_foto2 && <Image src={d.loja_foto2} style={S.lojaFoto} />}
              </View>
            )}

            <Text style={S.lojaNome}>{d.loja_nome}</Text>
            {d.loja_morada && <Text style={S.lojaDetalhe}>{d.loja_morada}</Text>}
            {(d.loja_email || d.loja_telefone) && (
              <Text style={S.lojaContacto}>
                {d.loja_email}{d.loja_telefone ? `  |  ${d.loja_telefone}` : ''}
              </Text>
            )}
          </View>

          {/* Gestor dedicado */}
          {(d.gestor || d.gestor_nome) && (
            <View style={S.gestorSection}>
              <Text style={S.gestorTitulo}>O Seu Gestor Dedicado</Text>
              <Text style={S.gestorNome}>{d.gestor_nome || d.gestor}</Text>
              {d.gestor_email && <Text style={S.gestorContacto}>{d.gestor_email}</Text>}
              {d.gestor_telemovel && <Text style={S.gestorContacto}>{d.gestor_telemovel}</Text>}
            </View>
          )}

          {/* QR App */}
          {qrDataUrl && (
            <View style={S.appSection}>
              <Text style={S.appTitulo}>App do Condominio  ·  Reporte Ocorrencias</Text>
              <Image src={qrDataUrl} style={S.qrImage} />
              <Text style={S.appSub}>Aceda a informacao e reporte ocorrencias pelo telemovel</Text>
            </View>
          )}

        </View>

        {/* Rodape */}
        <View style={S.footer}>
          <Text style={S.footerText}>www.impar.pt  ·  Gestao de Condominios desde 2004</Text>
          <Text style={S.footerText}>Impar © {new Date().getFullYear()}</Text>
        </View>

      </Page>
    </Document>
  )
}

// ── Botao gerador ─────────────────────────────────────────────────────────────

export default function BotaoFichaCondominio({ condominioId, condominioNome, nipc }) {
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState(null)

  async function handleGerar() {
    setLoading(true)
    setErro(null)
    try {
      const dados = await api.get(`/condominios/${condominioId}/ficha`)
      if (dados.error) throw new Error(dados.error)

      let qrDataUrl = null
      if (nipc) {
        qrDataUrl = await QRCode.toDataURL(
          `https://my.condexpress.com/?condominio=${nipc}`,
          { width: 200, margin: 1, color: { dark: '#011640', light: '#ffffff' } }
        )
      }

      const blob = await pdf(<FichaPDF dados={dados} qrDataUrl={qrDataUrl} />).toBlob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `ficha_${dados.n_impar}_${(condominioNome || 'condominio').replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleGerar}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: loading ? '#e2e8f0' : '#2D5A27',
          color: loading ? '#94a3b8' : '#ffffff',
          border: 'none', borderRadius: '0.5rem',
          padding: '0.5rem 1.125rem',
          fontSize: '0.82rem', fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          transition: 'all 0.15s',
        }}
      >
        {loading ? 'A gerar...' : 'Gerar Ficha PDF'}
      </button>
      {erro && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#dc2626' }}>Erro: {erro}</p>
      )}
    </div>
  )
}
