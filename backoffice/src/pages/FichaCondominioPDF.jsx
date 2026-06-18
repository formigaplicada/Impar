import { useState } from 'react'
import { pdf, Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { api } from '../lib/api'

// ── Registar fonte Yanone Kaffeesatz ──────────────────────────────────────────
Font.register({
  family: 'Yanone',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/yanonekaffeesatz/v27/3y976aknfjLm_3lMKjiMgR0IDI7-DKYweMg.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/yanonekaffeesatz/v27/3y9l6aknfjLm_3lMKjiMgR0IDI7-DKYwWKOT7Q.ttf', fontWeight: 700 },
  ]
})

// ── Cores ─────────────────────────────────────────────────────────────────────
const verde       = '#2D5A27'
const verdeClaro  = '#4A8C3F'
const cinzaEscuro = '#1E293B'
const cinzaMedio  = '#64748B'
const bgVerde     = '#EBF5E9'
const branco      = '#FFFFFF'
const navy        = '#011640'

// ── Estilos ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Yanone',
    backgroundColor: branco,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },

  // Cabeçalho verde
  header: {
    backgroundColor: bgVerde,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: verde,
  },
  headerTitulo: {
    fontSize: 28,
    fontWeight: 700,
    color: verde,
    fontFamily: 'Yanone',
  },
  headerNImpar: {
    fontSize: 14,
    color: cinzaMedio,
    fontFamily: 'Yanone',
    marginTop: 2,
  },

  // Corpo
  body: {
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 20,
    flex: 1,
  },

  // Morada principal
  moradaBlock: {
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  moradaNome: {
    fontSize: 22,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 4,
  },
  moradaDetalhe: {
    fontSize: 14,
    color: cinzaMedio,
    fontFamily: 'Yanone',
  },

  // Grid de dois blocos
  grid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  card: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitulo: {
    fontSize: 10,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
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

  // Secção loja
  lojaSection: {
    marginBottom: 16,
    backgroundColor: bgVerde,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C8E6C0',
  },
  lojaSectionTitulo: {
    fontSize: 11,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  lojaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  lojaInfo: {
    flex: 1,
  },
  lojaNome: {
    fontSize: 16,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 3,
  },
  lojaDetalhe: {
    fontSize: 12,
    color: cinzaMedio,
    fontFamily: 'Yanone',
    marginBottom: 2,
  },
  lojaContacto: {
    fontSize: 12,
    color: verde,
    fontFamily: 'Yanone',
  },
  lojaFotos: {
    flexDirection: 'row',
    gap: 8,
  },
  lojaFoto: {
    width: 90,
    height: 60,
    borderRadius: 4,
    objectFit: 'cover',
  },

  // Gestor
  gestorSection: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  gestorTitulo: {
    fontSize: 11,
    fontWeight: 700,
    color: verdeClaro,
    fontFamily: 'Yanone',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  gestorNome: {
    fontSize: 16,
    fontWeight: 700,
    color: cinzaEscuro,
    fontFamily: 'Yanone',
    marginBottom: 3,
  },
  gestorContacto: {
    fontSize: 12,
    color: verde,
    fontFamily: 'Yanone',
  },

  // QR + App
  appSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: bgVerde,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C8E6C0',
  },
  qrImage: {
    width: 70,
    height: 70,
  },
  appTexto: {
    flex: 1,
  },
  appTitulo: {
    fontSize: 13,
    fontWeight: 700,
    color: verde,
    fontFamily: 'Yanone',
    marginBottom: 3,
  },
  appSub: {
    fontSize: 11,
    color: cinzaMedio,
    fontFamily: 'Yanone',
  },

  // Rodapé
  footer: {
    backgroundColor: navy,
    paddingVertical: 10,
    paddingHorizontal: 32,
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
      <Text style={S.cardValue}>{value}</Text>
    </View>
  ) : null

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Cabeçalho */}
        <View style={S.header}>
          <View>
            <Text style={S.headerTitulo}>Ficha do Condomínio</Text>
            <Text style={S.headerNImpar}>Nº Ímpar: {d.n_impar}</Text>
          </View>
        </View>

        {/* Corpo */}
        <View style={S.body}>

          {/* Morada principal */}
          <View style={S.moradaBlock}>
            <Text style={S.moradaNome}>{d.nome}</Text>
            {d.morada && <Text style={S.moradaDetalhe}>{d.morada}{d.codigo_postal ? `  ·  ${d.codigo_postal}` : ''}</Text>}
          </View>

          {/* Grid: Identificação + Contactos */}
          <View style={S.grid}>
            <View style={S.card}>
              <Text style={S.cardTitulo}>Identificação</Text>
              <Row label="Nº Frações" value={d.n_fracoes} />
              <Row label="IBAN" value={d.iban} />
            </View>
            <View style={S.card}>
              <Text style={S.cardTitulo}>Contactos</Text>
              <Row label="Telefone" value={d.telefone} />
              <Row label="Telemóvel" value={d.telemovel} />
              <Row label="Telefone 2" value={d.telefone2} />
            </View>
          </View>

          {/* Loja de suporte */}
          <View style={S.lojaSection}>
            <Text style={S.lojaSectionTitulo}>🏢  A Sua Loja de Suporte</Text>
            <View style={S.lojaRow}>
              <View style={S.lojaInfo}>
                <Text style={S.lojaNome}>{d.loja_nome}</Text>
                {d.loja_morada && <Text style={S.lojaDetalhe}>{d.loja_morada}</Text>}
                {d.loja_email && <Text style={S.lojaContacto}>✉️  {d.loja_email}</Text>}
                {d.loja_telefone && <Text style={S.lojaContacto}>☎  {d.loja_telefone}</Text>}
              </View>
              {(d.loja_foto1 || d.loja_foto2) && (
                <View style={S.lojaFotos}>
                  {d.loja_foto1 && <Image src={d.loja_foto1} style={S.lojaFoto} />}
                  {d.loja_foto2 && <Image src={d.loja_foto2} style={S.lojaFoto} />}
                </View>
              )}
            </View>
          </View>

          {/* Gestor dedicado */}
          {(d.gestor || d.gestor_nome) && (
            <View style={S.gestorSection}>
              <Text style={S.gestorTitulo}>📞  O Seu Gestor Dedicado</Text>
              <Text style={S.gestorNome}>👤 {d.gestor_nome || d.gestor}</Text>
              {d.gestor_email && <Text style={S.gestorContacto}>✉️  {d.gestor_email}</Text>}
              {d.gestor_telemovel && <Text style={S.gestorContacto}>📱  {d.gestor_telemovel}</Text>}
            </View>
          )}

          {/* QR App */}
          {qrDataUrl && (
            <View style={S.appSection}>
              <Image src={qrDataUrl} style={S.qrImage} />
              <View style={S.appTexto}>
                <Text style={S.appTitulo}>📱  App do Condomínio</Text>
                <Text style={S.appSub}>Reporte ocorrências e acompanhe o seu condomínio através da app Ímpar.</Text>
              </View>
            </View>
          )}

        </View>

        {/* Rodapé */}
        <View style={S.footer}>
          <Text style={S.footerText}>www.impar.pt  ·  Gestão de Condomínios desde 2004</Text>
          <Text style={S.footerText}>Ímpar © {new Date().getFullYear()}</Text>
        </View>

      </Page>
    </Document>
  )
}

// ── Botão gerador ─────────────────────────────────────────────────────────────

export default function BotaoFichaCondominio({ condominioId, condominioNome, nipc }) {
  const [loading, setLoading] = useState(false)
  const [erro,    setErro]    = useState(null)

  async function handleGerar() {
    setLoading(true)
    setErro(null)
    try {
      // 1. Buscar dados
      const dados = await api.get(`/condominios/${condominioId}/ficha`)
      if (dados.error) throw new Error(dados.error)

      // 2. Gerar QR
      let qrDataUrl = null
      if (nipc) {
        qrDataUrl = await QRCode.toDataURL(
          `https://my.condexpress.com/?condominio=${nipc}`,
          { width: 200, margin: 1, color: { dark: '#011640', light: '#ffffff' } }
        )
      }

      // 3. Gerar PDF e fazer download
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
        {loading ? '⏳ A gerar…' : '📄 Gerar Ficha'}
      </button>
      {erro && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#dc2626' }}>❌ {erro}</p>
      )}
    </div>
  )
}
