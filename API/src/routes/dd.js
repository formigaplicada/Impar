import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'
import { getMicrosoftToken } from '../lib/microsoft.js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const dd = new Hono()

// =============================================================================
// HELPERS — XML
// =============================================================================

function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function extrairTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))
  return match ? match[1].trim() : null
}

const SEPA_REASON_CODES = {
  AC01: 'IBAN incorreto', AC04: 'Conta encerrada', AC06: 'Conta bloqueada',
  AG01: 'Débito direto não permitido nesta conta', AG02: 'Código de operação inválido',
  AM04: 'Fundos insuficientes', AM05: 'Débito duplicado', BE05: 'Credor não reconhecido',
  FF01: 'Formato de ficheiro inválido', MD01: 'Sem mandato válido',
  MD02: 'Dados do mandato em falta', MD06: 'Devolução solicitada pelo devedor',
  MD07: 'Devedor falecido', MS02: 'Devolução solicitada pelo cliente',
  MS03: 'Motivo não especificado', RC01: 'BIC incorreto',
  RR01: 'Identificação do devedor em falta', RR02: 'Nome do devedor em falta',
  RR03: 'Nome do credor em falta', RR04: 'Motivo regulatório',
  SL01: 'Serviço específico do banco devedor',
  RJ11: 'Autorização inativa pelo Devedor ou Banco do Devedor',
  '0000': 'Normal; lançamento executado',
}

// =============================================================================
// HELPERS — PAIN.008
// =============================================================================

function gerarPain008(creditor, ficheiro, transacoes) {
  const now      = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const msgId    = escapeXml(ficheiro.identificacao)
  const totalTxs = transacoes.length
  const totalValor = transacoes.reduce((s, t) => s + parseFloat(t.montante), 0).toFixed(2)

  const drctDbtTxInf = transacoes.map(tx => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>${escapeXml(tx.end_to_end_id)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(tx.montante).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(tx.adc)}</MndtId>
            <DtOfSgntr>${tx.data_assinatura instanceof Date ? tx.data_assinatura.toISOString().slice(0, 10) : String(tx.data_assinatura).slice(0, 10)}</DtOfSgntr>
            <AmdmntInd>false</AmdmntInd>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId><BICFI>${escapeXml(tx.bic)}</BICFI></FinInstnId>
        </DbtrAgt>
        <Dbtr><Nm>${escapeXml(tx.condominio_nome)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${escapeXml(tx.iban_devedor)}</IBAN></Id></DbtrAcct>
      </DrctDbtTxInf>`).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08 pain.008.001.08.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${totalTxs}</NbOfTxs>
      <CtrlSum>${totalValor}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(creditor.nome)}</Nm>
        <Id><PrvtId><Othr><Id>NOTPROVIDED</Id></Othr></PrvtId></Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${totalTxs}</NbOfTxs>
      <CtrlSum>${totalValor}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${ficheiro.data_liquidacao}</ReqdColltnDt>
      <Cdtr><Nm>${escapeXml(creditor.nome)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${escapeXml(creditor.iban)}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BICFI>${escapeXml(creditor.bic)}</BICFI></FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id><PrvtId><Othr>
          <Id>${escapeXml(creditor.creditor_identifier)}</Id>
        </Othr></PrvtId></Id>
      </CdtrSchmeId>
      ${drctDbtTxInf}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`
}

// =============================================================================
// HELPERS — PAIN.002
// =============================================================================

function parsePain002(xmlText) {
  const devolvidos = []
  const txBlocks = xmlText.match(/<TxInfAndSts>[\s\S]*?<\/TxInfAndSts>/g) || []

  for (const block of txBlocks) {
    const endToEndId    = extrairTag(block, 'OrgnlEndToEndId')
    const reasonCode    = extrairTag(block, 'Cd') || extrairTag(block, 'Prtry')
    const dataDevolucao = extrairTag(block, 'AccptncDtTm')?.substring(0, 10)
      || new Date().toISOString().substring(0, 10)
    const iban          = extrairTag(block, 'IBAN')
    const adc           = extrairTag(block, 'MndtId')

    if (!endToEndId || !reasonCode) continue

    devolvidos.push({
      end_to_end_id:      endToEndId,
      reason_code:        reasonCode,
      reason_description: SEPA_REASON_CODES[reasonCode] || `Código ${reasonCode}`,
      data_devolucao:     dataDevolucao,
      iban_devedor:       iban,
      adc,
    })
  }
  return devolvidos
}

// =============================================================================
// HELPERS — MANDATOS / PDF / EMAIL
// =============================================================================

function gerarTokenDD() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function expiresAtDD(days = 7) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function formatIBANDD(iban) {
  if (!iban) return '—'
  return iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}

function formatDatePT(date) {
  return new Date(date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
}

async function uploadMandatoPDF(env, condominioId, adc, pdfBytes) {
  const sql        = neon(env.DATABASE_URL)
  const msToken    = await getMicrosoftToken(env)
  const GRAPH_USER = 'vitor.lopes@impar.pt'

  const cond = await sql`SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}`
  if (!cond[0]?.onedrive_folder_id) throw new Error('Pasta OneDrive não configurada para este condomínio')
  const rootFolderId = cond[0].onedrive_folder_id

  let ddFolderId
  const folderRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${rootFolderId}/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DD', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    }
  )
  if (folderRes.ok) {
    ddFolderId = (await folderRes.json()).id
  } else if (folderRes.status === 409) {
    const listRes  = await fetch(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${rootFolderId}/children?$select=id,name`,
      { headers: { Authorization: `Bearer ${msToken}` } }
    )
    const listData = await listRes.json()
    const existing = (listData.value || []).find(i => i.name === 'DD')
    if (!existing) throw new Error('Não foi possível encontrar a pasta DD')
    ddFolderId = existing.id
  } else {
    const errText = await folderRes.text()
    throw new Error(`Erro ao criar pasta DD: ${folderRes.status} — ${errText}`)
  }

  const filename  = `Mandato_DD_${adc}_${new Date().toISOString().slice(0, 10)}.pdf`
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${ddFolderId}:/${encodeURIComponent(filename)}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/pdf' },
      body: pdfBytes,
    }
  )
  if (!uploadRes.ok) {
    const errText = await uploadRes.text()
    throw new Error(`SharePoint upload falhou: ${uploadRes.status} — ${errText}`)
  }
  const fileData = await uploadRes.json()
  return fileData.webUrl
}

async function enviarEmailMandato(env, { to, nome, link, adc, expiresAt }) {
  const msToken    = await getMicrosoftToken(env)
  const expiresStr = formatDatePT(expiresAt)
  const html = `
    <p>Exmo(a) Sr(a). ${nome},</p>
    <p>No âmbito da formalização do serviço de gestão de condomínio pela <strong>Rede Ímpar, Lda</strong>,
    solicitamos que proceda à assinatura da Autorização de Débito Direto SEPA (referência <strong>${adc}</strong>).</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#011640;color:#C8DA00;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;font-family:sans-serif">
        Assinar Autorização DD
      </a>
    </p>
    <p style="color:#666;font-size:13px">Este link é válido até <strong>${expiresStr}</strong>.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="color:#999;font-size:11px">Rede Ímpar, Lda &bull; Rua São Tomás de Aquino 18-M, 1600-874 Lisboa</p>
  `
  await fetch(`https://graph.microsoft.com/v1.0/users/propostas@impar.pt/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: `Ímpar — Autorização de Débito Direto SEPA (${adc})`,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { address: 'propostas@impar.pt', name: 'Rede Ímpar' } },
      },
      saveToSentItems: true,
    }),
  })
}

async function enviarEmailConfirmacao(env, { toCliente, nomeCliente, adc, signedAt }) {
  const msToken  = await getMicrosoftToken(env)
  const dateStr  = formatDatePT(signedAt)
  const timeStr  = signedAt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  const html = `
    <p>Exmo(a) Sr(a). ${nomeCliente},</p>
    <p>Confirmamos a receção da sua Autorização de Débito Direto SEPA (referência <strong>${adc}</strong>), assinada em ${dateStr} às ${timeStr}.</p>
    <p>Qualquer dúvida, contacte-nos através de <a href="mailto:geral@impar.pt">geral@impar.pt</a>.</p>
    <p>Com os melhores cumprimentos,<br><strong>Rede Ímpar, Lda</strong></p>
  `
  await fetch(`https://graph.microsoft.com/v1.0/users/propostas@impar.pt/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: `Confirmação — Autorização DD SEPA assinada (${adc})`,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: toCliente } }],
        from: { emailAddress: { address: 'propostas@impar.pt', name: 'Rede Ímpar' } },
      },
      saveToSentItems: true,
    }),
  })
}

async function gerarMandatoPDF(data) {
  const pdfDoc = await PDFDocument.create()
  const page   = pdfDoc.addPage([595, 842])
  const fB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fR = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fI = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  const NAVY  = rgb(0.004, 0.086, 0.251)
  const LIME  = rgb(0.784, 0.855, 0)
  const WHITE = rgb(1, 1, 1)
  const BLACK = rgb(0, 0, 0)
  const GRAY  = rgb(0.45, 0.45, 0.45)
  const LGRAY = rgb(0.94, 0.94, 0.94)
  const W = 595, H = 842, ML = 36, CW = 523

  const t = (text, x, y, size, font, color = BLACK) => {
    if (!text && text !== 0) return
    page.drawText(String(text), { x, y, size, font, color })
  }
  const hline = (y, color = rgb(0.82, 0.82, 0.82), thickness = 0.5) =>
    page.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness, color })
  const box = (x, y, w, h, fill, border) => {
    const opts = { x, y, width: w, height: h, color: fill }
    if (border) { opts.borderColor = border; opts.borderWidth = 0.5 }
    page.drawRectangle(opts)
  }
  const wrap = (text, x, y, maxW, size, font, color = BLACK, lh = size + 2.5) => {
    const words = text.split(' ')
    let line = '', cy = y
    for (const w of words) {
      const test = line + (line ? ' ' : '') + w
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        t(line, x, cy, size, font, color); cy -= lh; line = w
      } else line = test
    }
    if (line) { t(line, x, cy, size, font, color); cy -= lh }
    return cy
  }
  const campo = (labelPT, labelEN, valor, x, y, w) => {
    t(labelPT, x, y, 6, fI, GRAY)
    if (labelEN) t(' / ' + labelEN, x + fI.widthOfTextAtSize(labelPT, 6), y, 6, fI, rgb(0.6, 0.6, 0.6))
    const vy = y - 10
    t(valor ? String(valor).toUpperCase() : '—', x, vy, 8.5, fR, BLACK)
    page.drawLine({ start: { x, y: vy - 3 }, end: { x: x + w, y: vy - 3 }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) })
    return vy - 10
  }
  const secHeader = (pt, en, y) => {
    box(ML, y - 13, CW, 14, NAVY, null)
    t(pt, ML + 5, y - 9.5, 8, fB, WHITE)
    if (en) t('  /  ' + en, ML + 5 + fB.widthOfTextAtSize(pt, 8), y - 9.5, 7, fI, LIME)
    return y - 13 - 6
  }

  let y = H - 10
  box(ML, y - 56, CW, 56, NAVY, null)
  const credorW = 185, credorX = ML + CW - credorW
  box(credorX, y - 54, credorW - 2, 52, WHITE, null)
  t('Rede Impar, Lda', credorX + 6, y - 18, 9, fB, NAVY)
  t('NIF 515261599  |  PT18ZZZ114843', credorX + 6, y - 29, 6, fR, GRAY)
  t('Via do Oriente 5.02 03.B', credorX + 6, y - 39, 6, fR, GRAY)
  t('1990-002 Lisboa  |  Portugal', credorX + 6, y - 48, 6, fR, GRAY)

  const titleAreaW = CW - credorW - 10
  const titlePT = 'Autorização de Débito Direto SEPA'
  const titleEN = 'SEPA Direct Debit Mandate'
  t(titlePT, ML + (titleAreaW - fB.widthOfTextAtSize(titlePT, 12)) / 2, y - 22, 12, fB, WHITE)
  t(titleEN, ML + (titleAreaW - fI.widthOfTextAtSize(titleEN, 8.5)) / 2, y - 35, 8.5, fI, LIME)
  y -= 62

  box(ML, y - 15, CW, 15, LGRAY, null)
  t('Referência da autorização (ADD) / Mandate reference:', ML + 4, y - 10, 6.5, fI, GRAY)
  t(data.adc || '', ML + 210, y - 10, 7.5, fB, NAVY)
  y -= 23

  const lPT = 'Ao subscrever esta autorização, está a autorizar a Rede Impar, Lda a enviar instruções ao seu Banco para debitar a sua conta, de acordo com as instruções do Credor. O reembolso deve ser solicitado até 8 semanas a contar da data do débito.'
  const lEN = 'By signing this mandate form, you authorise Rede Impar, Lda to send instructions to your bank to debit your account. A refund must be claimed within 8 weeks from the date on which your account was debited.'
  y = wrap(lPT, ML, y, CW, 6.5, fR, BLACK) - 2
  y = wrap(lEN, ML, y, CW, 6, fI, GRAY) - 6
  hline(y); y -= 8

  y = secHeader('Identificação do Devedor', 'Debtor identification', y)
  y = campo('* Nome do(s) Devedor(es)', 'Name of the debtor(s)', data.nomeDevedor, ML, y, CW) - 2
  y = campo('Nome da rua e número', 'Street name and number', data.moradaDevedor, ML, y, CW) - 2
  y = campo('* Número de conta - IBAN', 'Account number - IBAN', data.iban ? data.iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim() : '', ML, y, CW) - 2
  y = campo('BIC SWIFT', 'SWIFT BIC', data.bic || '', ML, y, 200) - 2
  hline(y); y -= 8

  y = secHeader('Identificação do Credor', 'Creditor identification', y)
  y = campo('** Nome do Credor', 'Creditor name', data.credorNome || 'Rede Impar, Lda', ML, y, CW) - 2
  y = campo('** Código de Identificação do Credor', 'Creditor identifier', data.credorId || 'PT18ZZZ114843', ML, y, CW) - 2
  hline(y); y -= 8

  y = secHeader('Tipo de pagamento', 'Type of payment', y)
  const cbY = y - 11
  box(ML, cbY, 11, 11, WHITE, BLACK)
  t('X', ML + 2, cbY + 2, 8, fB, BLACK)
  t('* Pagamento recorrente / Recurrent payment', ML + 14, y - 4, 8, fR, BLACK)
  y -= 20; hline(y); y -= 8

  y = secHeader('Local de assinatura', 'City or town in which you are signing', y)
  const d = data.signedAt
  const dd2 = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  const aa  = String(d.getFullYear()).slice(2)
  t('* Data / Date  (DD MM AA)', ML + 340, y, 6, fI, GRAY)
  t(`${dd2}   ${mm}   ${aa}`, ML + 340, y - 10, 9, fB, BLACK)
  y -= 24; hline(y); y -= 8

  y = secHeader('Assinar aqui por favor', 'Please sign here', y)
  const sigH = 52
  box(ML, y - sigH, CW, sigH, rgb(0.985, 0.99, 1), NAVY)
  if (data.signaturePng) {
    try {
      const b64s = data.signaturePng.replace(/^data:image\/png;base64,/, '')
      const sb   = Uint8Array.from(atob(b64s), c => c.charCodeAt(0))
      const img  = await pdfDoc.embedPng(sb)
      page.drawImage(img, { x: ML + 8, y: y - sigH + 6, width: 260, height: sigH - 12 })
    } catch (_) {}
  }
  t('*Assinatura(s) / Signature(s)', ML + 5, y - sigH + 3, 6, fI, GRAY)
  y -= sigH + 4

  box(0, 0, W, 14, LGRAY, null)
  t('Form SEPA Core DD  |  Rede Impar, Lda  |  PT18ZZZ114843', ML, 4, 6, fR, GRAY)

  return await pdfDoc.save()
}

// =============================================================================
// HELPERS — GERAÇÃO
// =============================================================================

// Deriva a versão do identificador (v1, v2, ...) para o mesmo loja+periodo
async function proximaVersao(sql, lojaId, periodo) {
  const rows = await sql`
    SELECT identificacao FROM ficheiros_dd
    WHERE loja_id = ${lojaId} AND identificacao LIKE ${periodo + '%'}
    ORDER BY id DESC LIMIT 1
  `
  if (rows.length === 0) return 'v1'
  const match = rows[0].identificacao.match(/v(\d+)$/)
  return match ? `v${parseInt(match[1]) + 1}` : 'v2'
}

// Constrói o nome do ficheiro: "{loja.nome} {MM} {YYYY} {vN}"
function buildIdentificacao(lojaNome, periodo, versao) {
  const [ano, mes] = periodo.split('-')
  return `${lojaNome} ${mes} ${ano} ${versao}`
}

// Data de liquidação: dia 25 do mês do período
function dataLiquidacao(periodo) {
  const [ano, mes] = periodo.split('-')
  return `${ano}-${mes}-25`
}

// =============================================================================
// POST /dd/lotes — gerar ficheiro PAIN.008 para uma loja + período
// =============================================================================
dd.post('/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const { loja_id, periodo } = await c.req.json()
  if (!loja_id || !periodo) return c.json({ error: 'loja_id e periodo são obrigatórios' }, 400)
  if (!/^\d{4}-\d{2}$/.test(periodo)) return c.json({ error: 'periodo deve ter formato YYYY-MM' }, 400)

  const sql = neon(c.env.DATABASE_URL)

  try {
    // Loja + creditor
    const lojaRows = await sql`
      SELECT l.id, l.nome, dc.nome AS credor_nome, dc.iban, dc.bic, dc.creditor_identifier
      FROM lojas l
      JOIN dd_creditor dc ON dc.id = l.creditor_id
      WHERE l.id = ${loja_id} AND l.ativo = true
    `
    if (lojaRows.length === 0) return c.json({ error: 'Loja não encontrada ou sem creditor configurado' }, 404)
    const loja     = lojaRows[0]
    const creditor = {
      nome:                loja.credor_nome,
      iban:                loja.iban,
      bic:                 loja.bic,
      creditor_identifier: loja.creditor_identifier,
    }

    // Condomínios da loja com contrato DD ativo + mandato ativo/pendente
    // DISTINCT ON para evitar duplicados quando há múltiplos contratos DD
    const condominios = await sql`
      SELECT DISTINCT ON (c.id)
        c.id, c.nome,
        m.id           AS mandato_id,
        m.adc,
        m.data_assinatura,
        m.iban         AS iban_devedor,
        b.bic,
        COALESCE(
          (SELECT SUM(cs.valor_mensal)
           FROM contrato_servicos cs
           JOIN contratos ct2 ON ct2.id = cs.contrato_id
           WHERE ct2.condominio_id = c.id
             AND ct2.tipo = 'condominio'
             AND ct2.payment_method = 'DD'
             AND ct2.estado = 'ativo'),
          0
        ) AS montante
      FROM condominios c
      JOIN contratos ct
        ON ct.condominio_id = c.id
        AND ct.tipo = 'condominio'
        AND ct.payment_method = 'DD'
        AND ct.estado = 'ativo'
      JOIN mandatos_dd m
        ON m.condominio_id = c.id
        AND m.estado IN ('activo', 'pendente')
      JOIN bancos b ON b.id = m.banco_id
      WHERE c.loja_id = ${loja_id} AND c.ativo = true
      ORDER BY c.id, m.id ASC
    `

    if (condominios.length === 0) {
      return c.json({ error: 'Nenhum condomínio com contrato DD e mandato ativo encontrado para esta loja' }, 400)
    }

    // Versão e identificação
    const versao        = await proximaVersao(sql, loja_id, periodo)
    const identificacao = buildIdentificacao(loja.nome, periodo, versao)
    const dataLiq       = dataLiquidacao(periodo)

    // Criar ficheiro_dd
    const ficheiroRows = await sql`
      INSERT INTO ficheiros_dd (loja_id, identificacao, data_liquidacao, estado)
      VALUES (${loja_id}, ${identificacao}, ${dataLiq}, 'gerado')
      RETURNING id
    `
    const ficheiroId = ficheiroRows[0].id

    // Buscar pendentes de meses anteriores
    const pendentesAnteriores = await sql`
      SELECT
        cd.id, cd.montante, cd.mandato_id, cd.condominio_id,
        m.adc, m.data_assinatura, m.iban AS iban_devedor,
        b.bic,
        c.nome AS condominio_nome
      FROM "cobranças_dd" cd
      JOIN mandatos_dd m  ON m.id  = cd.mandato_id
      JOIN bancos b       ON b.id  = m.banco_id
      JOIN condominios c  ON c.id  = cd.condominio_id
      WHERE cd.estado = 'rejeitado'
        AND c.loja_id = ${loja_id}
        AND cd.ficheiro_id != ${ficheiroId}
      ORDER BY cd.criado_em ASC
    `

    const todasTxs = []
    let sequencia  = 1

    // ── Batch insert pendentes anteriores ────────────────────────────────────
    if (pendentesAnteriores.length > 0) {
      const pFicheiroIds    = pendentesAnteriores.map(() => ficheiroId)
      const pCondominioIds  = pendentesAnteriores.map(p => p.condominio_id)
      const pMandatoIds     = pendentesAnteriores.map(p => p.mandato_id)
      const pMontantes      = pendentesAnteriores.map(p => p.montante)
      const pOriginalIds    = pendentesAnteriores.map(p => p.id)

      await sql`
        INSERT INTO "cobranças_dd" (ficheiro_id, condominio_id, mandato_id, montante, estado)
        SELECT
          unnest(${pFicheiroIds}::int[]),
          unnest(${pCondominioIds}::text[]),
          unnest(${pMandatoIds}::int[]),
          unnest(${pMontantes}::numeric[]),
          'pendente'
      `

      await sql`
        UPDATE "cobranças_dd" SET estado = 'reincluido'
        WHERE id = ANY(${pOriginalIds}::int[])
      `

      for (const p of pendentesAnteriores) {
        todasTxs.push({
          end_to_end_id:   `${sequencia++}`,
          montante:        p.montante,
          adc:             p.adc,
          data_assinatura: p.data_assinatura,
          iban_devedor:    p.iban_devedor,
          bic:             p.bic,
          condominio_nome: p.condominio_nome,
        })
      }
    }

    // ── Batch insert cobranças do período atual ───────────────────────────────
    const correntes = condominios.filter(c => parseFloat(c.montante) > 0)

    if (correntes.length > 0) {
      const cFicheiroIds   = correntes.map(() => ficheiroId)
      const cCondominioIds = correntes.map(c => c.id)
      const cMandatoIds    = correntes.map(c => c.mandato_id)
      const cMontantes     = correntes.map(c => parseFloat(c.montante))

      await sql`
        INSERT INTO "cobranças_dd" (ficheiro_id, condominio_id, mandato_id, montante, estado)
        SELECT
          unnest(${cFicheiroIds}::int[]),
          unnest(${cCondominioIds}::text[]),
          unnest(${cMandatoIds}::int[]),
          unnest(${cMontantes}::numeric[]),
          'pendente'
      `

      for (const cond of correntes) {
        todasTxs.push({
          end_to_end_id:   `${sequencia++}`,
          montante:        parseFloat(cond.montante),
          adc:             cond.adc,
          data_assinatura: cond.data_assinatura,
          iban_devedor:    cond.iban_devedor,
          bic:             cond.bic,
          condominio_nome: cond.nome,
        })
      }
    }

    if (todasTxs.length === 0) {
      await sql`DELETE FROM ficheiros_dd WHERE id = ${ficheiroId}`
      return c.json({ error: 'Nenhuma transação com montante válido' }, 400)
    }

    // Totais + XML
    const montanteTotal = todasTxs.reduce((s, t) => s + parseFloat(t.montante), 0)
    const ficheiro      = { identificacao, data_liquidacao: dataLiq }
    const xmlContent    = gerarPain008(creditor, ficheiro, todasTxs)

    await sql`
      UPDATE ficheiros_dd
      SET n_registos    = ${todasTxs.length},
          montante_total = ${montanteTotal.toFixed(2)},
          pain008_xml   = ${xmlContent}
      WHERE id = ${ficheiroId}
    `

    return c.json({
      ok:                    true,
      ficheiro_id:           ficheiroId,
      identificacao,
      data_liquidacao:       dataLiq,
      n_registos:            todasTxs.length,
      montante_total:        montanteTotal.toFixed(2),
      pendentes_reincluidos: pendentesAnteriores.length,
    }, 201)

  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/lotes — listar ficheiros por loja
// =============================================================================

dd.get('/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const { loja_id } = c.req.query()

  try {
    const rows = await sql`
      SELECT
        f.id, f.loja_id, f.identificacao, f.data_geracao, f.data_liquidacao,
        f.n_registos, f.montante_total, f.estado,
        l.nome AS loja_nome,
        COUNT(cd.id)                                                          AS total_cobranças,
        COALESCE(SUM(CASE WHEN cd.estado = 'aceite'    THEN cd.montante END), 0) AS valor_aceite,
        COALESCE(SUM(CASE WHEN cd.estado = 'rejeitado' THEN cd.montante END), 0) AS valor_rejeitado,
        COALESCE(SUM(CASE WHEN cd.estado = 'pendente'  THEN cd.montante END), 0) AS valor_pendente
      FROM ficheiros_dd f
      JOIN lojas l ON l.id = f.loja_id
      LEFT JOIN "cobranças_dd" cd ON cd.ficheiro_id = f.id
      ${loja_id ? sql`WHERE f.loja_id = ${parseInt(loja_id)}` : sql``}
      GROUP BY f.id, l.nome
      ORDER BY f.data_geracao DESC
      LIMIT 50
    `
    return c.json({ ficheiros: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/lotes/:id — detalhe de ficheiro + cobranças
// =============================================================================

dd.get('/lotes/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const ficheiroRows = await sql`
      SELECT f.*, l.nome AS loja_nome, dc.nome AS credor_nome
      FROM ficheiros_dd f
      JOIN lojas l ON l.id = f.loja_id
      JOIN dd_creditor dc ON dc.id = l.creditor_id
      WHERE f.id = ${id}
    `
    if (ficheiroRows.length === 0) return c.json({ error: 'Ficheiro não encontrado' }, 404)

    const cobranças = await sql`
      SELECT
        cd.id, cd.montante, cd.estado, cd.codigo_retorno, cd.criado_em,
        c.nome AS condominio_nome, c.id AS condominio_id,
        m.adc, m.iban AS iban_devedor,
        b.nome AS banco_nome,
        SEPA_REASON_CODES.descricao AS descricao_retorno
      FROM "cobranças_dd" cd
      JOIN condominios c ON c.id = cd.condominio_id
      JOIN mandatos_dd m ON m.id = cd.mandato_id
      JOIN bancos b ON b.id = m.banco_id
      LEFT JOIN LATERAL (
        SELECT ${JSON.stringify(SEPA_REASON_CODES)}::jsonb ->> cd.codigo_retorno AS descricao
      ) SEPA_REASON_CODES ON true
      WHERE cd.ficheiro_id = ${id}
      ORDER BY c.nome
    `

    return c.json({ ficheiro: ficheiroRows[0], cobranças })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/lotes/:id/pain008 — download XML
// =============================================================================

dd.get('/lotes/:id/pain008', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const rows = await sql`SELECT identificacao, pain008_xml FROM ficheiros_dd WHERE id = ${id}`
    if (rows.length === 0) return c.json({ error: 'Ficheiro não encontrado' }, 404)
    if (!rows[0].pain008_xml) return c.json({ error: 'XML ainda não gerado' }, 400)

    return new Response(rows[0].pain008_xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${rows[0].identificacao}.xml"`,
      },
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// POST /dd/lotes/:id/retorno — processar PAIN.002
// =============================================================================

dd.post('/lotes/:id/retorno', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const ficheiroRows = await sql`SELECT id, loja_id FROM ficheiros_dd WHERE id = ${id}`
    if (ficheiroRows.length === 0) return c.json({ error: 'Ficheiro não encontrado' }, 404)
    const ficheiro = ficheiroRows[0]

    const { xml } = await c.req.json()
    if (!xml) return c.json({ error: 'xml é obrigatório no body' }, 400)

    const devolvidos = parsePain002(xml)

    // Criar registo de retorno
    const retornoRows = await sql`
      INSERT INTO retornos_dd (ficheiro_dd_id, loja_id, tipo, data_retorno, data_liquidacao, n_registos, xml_original)
      VALUES (${id}, ${ficheiro.loja_id}, 'pain002', NOW(), NOW(), ${devolvidos.length}, ${xml})
      RETURNING id
    `
    const retornoId = retornoRows[0].id

    // Buscar todas as cobranças do ficheiro de uma vez
    const cobranças = await sql`
      SELECT cd.id, cd.mandato_id, m.adc
      FROM "cobranças_dd" cd
      JOIN mandatos_dd m ON m.id = cd.mandato_id
      WHERE cd.ficheiro_id = ${id} AND cd.estado = 'pendente'
    `
    // Map por adc para lookup rápido
    const porAdc = Object.fromEntries(cobranças.map(r => [r.adc, r]))

    const adcsRejeitados = new Set()
    let processados = 0, naoEncontrados = 0

    for (const dev of devolvidos) {
      const cobranca = dev.adc ? porAdc[dev.adc] : null

      // Inserir evento_retorno
      await sql`
        INSERT INTO eventos_retorno (retorno_id, cobranca_id, adc, iban_devedor, montante, codigo_retorno, descricao_retorno)
        SELECT
          ${retornoId},
          ${cobranca ? cobranca.id : null},
          ${dev.adc || dev.end_to_end_id},
          ${dev.iban_devedor || null},
          cd.montante,
          ${dev.reason_code},
          ${dev.reason_description}
        FROM "cobranças_dd" cd
        WHERE cd.id = ${cobranca ? cobranca.id : null}
        UNION ALL
        SELECT ${retornoId}, null, ${dev.adc || dev.end_to_end_id}, ${dev.iban_devedor || null},
               null, ${dev.reason_code}, ${dev.reason_description}
        WHERE ${cobranca ? cobranca.id : null} IS NULL
        LIMIT 1
      `

      if (!cobranca) {
        naoEncontrados++
        continue
      }

      adcsRejeitados.add(cobranca.id)
      await sql`
        UPDATE "cobranças_dd"
        SET estado = 'rejeitado', codigo_retorno = ${dev.reason_code}
        WHERE id = ${cobranca.id}
      `
      processados++
    }

    // Cobranças que não vieram no retorno → aceites
    const idsRejeitados = [...adcsRejeitados]
    if (idsRejeitados.length > 0) {
      await sql`
        UPDATE "cobranças_dd"
        SET estado = 'aceite'
        WHERE ficheiro_id = ${id}
          AND estado = 'pendente'
          AND id != ALL(${idsRejeitados})
      `
    } else {
      await sql`
        UPDATE "cobranças_dd" SET estado = 'aceite'
        WHERE ficheiro_id = ${id} AND estado = 'pendente'
      `
    }

    await sql`UPDATE ficheiros_dd SET estado = 'processado' WHERE id = ${id}`

    return c.json({
      ok:              true,
      retorno_id:      retornoId,
      rejeitados:      processados,
      aceites:         cobranças.length - processados,
      nao_encontrados: naoEncontrados,
      total_retorno:   devolvidos.length,
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/dashboard — resumo geral (filtrável por loja)
// =============================================================================

dd.get('/dashboard', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const { loja_id } = c.req.query()
  const lojaFilter = loja_id ? sql`AND f.loja_id = ${parseInt(loja_id)}` : sql``

  try {
    const [resumo, ultimosFicheiros, topRejeicoes] = await Promise.all([
      sql`
        SELECT
          COUNT(DISTINCT f.id)                                                           AS total_ficheiros,
          COALESCE(SUM(CASE WHEN cd.estado = 'aceite'    THEN cd.montante END), 0)      AS total_aceite,
          COALESCE(SUM(CASE WHEN cd.estado = 'rejeitado' THEN cd.montante END), 0)      AS total_rejeitado,
          COALESCE(SUM(CASE WHEN cd.estado = 'pendente'  THEN cd.montante END), 0)      AS total_pendente,
          COUNT(CASE WHEN cd.estado = 'rejeitado' THEN 1 END)                           AS num_rejeicoes
        FROM ficheiros_dd f
        LEFT JOIN "cobranças_dd" cd ON cd.ficheiro_id = f.id
        WHERE true ${lojaFilter}
      `,
      sql`
        SELECT f.id, f.identificacao, f.data_liquidacao, f.n_registos, f.montante_total, f.estado, l.nome AS loja_nome
        FROM ficheiros_dd f
        JOIN lojas l ON l.id = f.loja_id
        WHERE true ${lojaFilter}
        ORDER BY f.data_geracao DESC LIMIT 6
      `,
      sql`
        SELECT cd.codigo_retorno, COUNT(*) AS ocorrencias,
               COALESCE(SUM(cd.montante), 0) AS montante_total
        FROM "cobranças_dd" cd
        JOIN ficheiros_dd f ON f.id = cd.ficheiro_id
        WHERE cd.estado = 'rejeitado' ${lojaFilter}
        GROUP BY cd.codigo_retorno
        ORDER BY ocorrencias DESC LIMIT 10
      `,
    ])

    return c.json({
      resumo:           resumo[0],
      ultimos_ficheiros: ultimosFicheiros,
      top_rejeicoes:    topRejeicoes,
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// POST /dd/mandatos/create
// =============================================================================

dd.post('/mandatos/create', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const { condominio_id, email_devedor } = await c.req.json()

  if (!condominio_id || !email_devedor) {
    return c.json({ error: 'Campos obrigatórios: condominio_id, email_devedor' }, 400)
  }

  try {
    // Buscar dados do condomínio + banco via IBAN
        const condRows = await sql`
          SELECT c.nipc, c.nome, c.iban, b.id AS banco_id, b.codigo AS banco_codigo
          FROM condominios c
          LEFT JOIN bancos b ON b.codigo = LEFT(REPLACE(c.iban, ' ', ''), 8)
          WHERE c.id = ${condominio_id}
        `
    
    if (condRows.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)
    const cond = condRows[0]

    if (!cond.nipc)     return c.json({ error: 'Condomínio sem NIF definido' }, 400)
    if (!cond.iban)     return c.json({ error: 'Condomínio sem IBAN definido' }, 400)
    if (!cond.banco_id) return c.json({ error: 'Banco não reconhecido para o IBAN ' + cond.iban }, 400)

    // Gerar ADC: PT50 + 4 dígitos do banco + NIF
    const codigoBanco = cond.banco_codigo.substring(4, 8) // PT500035 → 0035
    const adc = `PT50${codigoBanco}${cond.nipc}`

    const token     = gerarTokenDD()
    const expiresAt = expiresAtDD(7)

    const rows = await sql`
      INSERT INTO mandatos_dd (condominio_id, adc, iban, banco_id, data_assinatura, estado, token, token_expires_at, nome_devedor, email_devedor)
      VALUES (${condominio_id}, ${adc}, ${cond.iban}, ${cond.banco_id}, CURRENT_DATE, 'pendente', ${token}, ${expiresAt}, ${cond.nome}, ${email_devedor})
      RETURNING id, token, adc
    `
    const mandato = rows[0]
    const link    = `${c.env.DD_BASE_URL}/dd/assinar?t=${token}`

    await enviarEmailMandato(c.env, { to: email_devedor, nome: cond.nome, link, adc, expiresAt: new Date(expiresAt) })

    return c.json({ id: mandato.id, token: mandato.token, link, adc: mandato.adc, email: email_devedor })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/assinar/:token (público)
// =============================================================================

dd.get('/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  try {
    const rows = await sql`
      SELECT
        m.id, m.adc, m.iban, m.estado, m.nome_devedor, m.email_devedor, m.token_expires_at, m.signed_at,
        cond.nome AS condominio_nome, cond.morada AS condominio_morada,
        cond.codigo_postal AS condominio_cp, cond.cidade AS condominio_cidade,
        b.id AS banco_id, b.nome AS banco_nome, b.bic AS banco_bic,
        cr.nome AS credor_nome, cr.creditor_identifier AS credor_id,
        cr.morada AS credor_morada, cr.codigo_postal AS credor_cp, cr.cidade AS credor_cidade
      FROM mandatos_dd m
      JOIN condominios cond ON cond.id = m.condominio_id
      LEFT JOIN bancos b ON b.id = m.banco_id
      JOIN lojas l ON l.id = cond.loja_id
      JOIN dd_creditor cr ON cr.id = l.creditor_id
      WHERE m.token = ${token} LIMIT 1
    `
    if (rows.length === 0) return c.json({ error: 'Link inválido ou expirado' }, 404)
    const m = rows[0]
    if (m.estado === 'activo') return c.json({ error: 'Este mandato já foi assinado', signed: true }, 410)
    if (new Date(m.token_expires_at) < new Date()) return c.json({ error: 'Este link expirou.', expired: true }, 410)

    return c.json({
      adc:         m.adc,
      iban:        m.iban ? formatIBANDD(m.iban) : '',
      bic:         m.banco_bic || '',
      banco_id:    m.banco_id || null,
      nome_devedor: m.nome_devedor,
      condominio:  { nome: m.condominio_nome, morada: m.condominio_morada, cod_postal: m.condominio_cp, cidade: m.condominio_cidade },
      credor:      { nome: m.credor_nome || 'Rede Impar, Lda', identifier: m.credor_id || 'PT18ZZZ114843', morada: m.credor_morada || '', cod_postal: m.credor_cp || '', cidade: m.credor_cidade || '' },
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// POST /dd/assinar/:token (público)
// =============================================================================

dd.post('/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')
  const ip    = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const body  = await c.req.json()
  const { iban, bic, banco_id, nome_devedor, signature_png } = body

  if (!signature_png || !nome_devedor) {
    return c.json({ error: 'Campos obrigatórios: nome_devedor, signature_png' }, 400)
  }

  try {
    const rows = await sql`
      SELECT
        m.*,
        cond.nome AS condo_nome, cond.morada, cond.codigo_postal, cond.cidade,
        cr.nome AS credor_nome, cr.creditor_identifier,
        cr.morada AS credor_morada, cr.codigo_postal AS credor_cp, cr.cidade AS credor_cidade,
        b.bic AS banco_bic
      FROM mandatos_dd m
      JOIN condominios cond ON cond.id = m.condominio_id
      JOIN lojas l ON l.id = cond.loja_id
      JOIN dd_creditor cr ON cr.id = l.creditor_id
      LEFT JOIN bancos b ON b.id = m.banco_id
      WHERE m.token = ${token} LIMIT 1
    `
    if (rows.length === 0) return c.json({ error: 'Link inválido' }, 404)
    const m = rows[0]
    if (m.estado === 'activo') return c.json({ error: 'Já assinado', signed: true }, 410)
    if (new Date(m.token_expires_at) < new Date()) return c.json({ error: 'Link expirado' }, 410)

    const ibanClean = (iban || m.iban || '').replace(/\s/g, '').toUpperCase()
    const signedAt  = new Date()
    const finalBic  = bic || m.banco_bic || ''

    const pdfBytes = await gerarMandatoPDF({
      adc:          m.adc,
      nomeDevedor:  nome_devedor,
      moradaDevedor: m.morada || '',
      cpDevedor:    m.codigo_postal || '',
      cidadeDevedor: m.cidade || '',
      credorNome:   m.credor_nome || 'Rede Impar, Lda',
      credorId:     m.creditor_identifier || 'PT18ZZZ114843',
      credorMorada: m.credor_morada || '',
      credorCp:     m.credor_cp || '',
      credorCidade: m.credor_cidade || '',
      iban:         ibanClean,
      bic:          finalBic,
      signaturePng: signature_png,
      signedAt,
      signedIp:     ip,
    })

    const pdfUrl = await uploadMandatoPDF(c.env, m.condominio_id, m.adc, pdfBytes)

    await sql`
      UPDATE mandatos_dd
      SET iban             = ${ibanClean},
          banco_id         = ${banco_id || m.banco_id},
          nome_devedor     = ${nome_devedor},
          signature_png    = ${signature_png},
          signed_at        = ${signedAt.toISOString()},
          signed_ip        = ${ip},
          pdf_url          = ${pdfUrl},
          estado           = 'activo',
          data_assinatura  = CURRENT_DATE,
          atualizado_em    = NOW()
      WHERE token = ${token}
    `

    await enviarEmailConfirmacao(c.env, { toCliente: m.email_devedor, nomeCliente: nome_devedor, adc: m.adc, signedAt })

    return c.json({ success: true, adc: m.adc })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// GET /dd/bancos (público)
// =============================================================================

dd.get('/bancos', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`SELECT id, nome, bic FROM bancos ORDER BY nome`
    return c.json(rows)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

dd.get('/lotes/:id/excel', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  const SERVICO_GESTAO  = '9b27bffe-e572-4b9c-8af3-af4c6eec9c84'
  const SERVICO_LIMPEZA = '9bba3a34-f82f-4b57-bf07-b3d0f4ad809a'

  try {
    const ficheiroRows = await sql`
      SELECT f.id, f.identificacao, f.loja_id, l.nome AS loja_nome
      FROM ficheiros_dd f
      JOIN lojas l ON l.id = f.loja_id
      WHERE f.id = ${id}
    `
    if (ficheiroRows.length === 0) return c.json({ error: 'Ficheiro não encontrado' }, 404)
    const ficheiro = ficheiroRows[0]

    // Cobranças do ficheiro com toda a info necessária
    const cobranças = await sql`
      SELECT
        cd.id,
        cd.montante,
        cd.condominio_id,
        cd.mandato_id,
        c.nome        AS condominio_nome,
        c.n_impar,
        m.adc,
        m.iban        AS iban_devedor,
        -- Período: do ficheiro original se for reincluído, senão do ficheiro atual
        CASE
          WHEN cd.estado = 'reincluido' THEN NULL
          ELSE f_orig.identificacao
        END AS periodo_origem,
        -- Tipo
        CASE
          WHEN EXISTS (
            SELECT 1 FROM "cobranças_dd" cd_orig
            WHERE cd_orig.estado = 'reincluido'
              AND cd_orig.ficheiro_id != ${id}
          ) THEN 'Acerto'
          ELSE 'Corrente'
        END AS tipo,
        -- Valor gestão
        COALESCE((
          SELECT SUM(cs.valor_mensal)
          FROM contrato_servicos cs
          JOIN contratos ct ON ct.id = cs.contrato_id
          WHERE ct.condominio_id = cd.condominio_id
            AND ct.tipo = 'condominio'
            AND ct.estado = 'ativo'
            AND cs.servico_id = ${SERVICO_GESTAO}
        ), 0) AS valor_gestao,
        -- Valor limpeza
        COALESCE((
          SELECT SUM(cs.valor_mensal)
          FROM contrato_servicos cs
          JOIN contratos ct ON ct.id = cs.contrato_id
          WHERE ct.condominio_id = cd.condominio_id
            AND ct.tipo = 'condominio'
            AND ct.estado = 'ativo'
            AND cs.servico_id = ${SERVICO_LIMPEZA}
        ), 0) AS valor_limpeza,
        f_orig.identificacao AS ficheiro_origem_identificacao
      FROM "cobranças_dd" cd
      JOIN condominios c   ON c.id  = cd.condominio_id
      JOIN mandatos_dd m   ON m.id  = cd.mandato_id
      -- Ficheiro de origem (para pendentes reincluídos)
      LEFT JOIN "cobranças_dd" cd_orig
        ON cd_orig.estado = 'reincluido'
        AND cd_orig.condominio_id = cd.condominio_id
        AND cd_orig.mandato_id = cd.mandato_id
        AND cd_orig.montante = cd.montante
      LEFT JOIN ficheiros_dd f_orig ON f_orig.id = cd_orig.ficheiro_id
      WHERE cd.ficheiro_id = ${id}
      ORDER BY c.nome ASC
    `

    if (cobranças.length === 0) return c.json({ error: 'Sem cobranças neste ficheiro' }, 400)

    // Determinar período corrente a partir da identificação do ficheiro
    // ex: "Barreiro 1 06 2026 v1" -> "2026-06"
    const matchPeriodo = ficheiro.identificacao.match(/(\d{2})\s+(\d{4})/)
    const periodoCorrente = matchPeriodo
      ? `${matchPeriodo[2]}-${matchPeriodo[1]}`
      : ficheiro.identificacao

    // Construir CSV
    const BOM = '\uFEFF'
    const sep = ';'

    const cabecalho = [
      'Loja', 'N.º Ímpar', 'Nome', 'IBAN', 'ADC',
      'Período', 'Tipo', 'Gestão', 'Limpeza', 'Total'
    ].join(sep)

    const linhas = cobranças.map(r => {
      // Período: se vier do ficheiro de origem usa esse, senão usa o corrente
      const periodo = r.ficheiro_origem_identificacao
        ? (() => {
            const m = r.ficheiro_origem_identificacao.match(/(\d{2})\s+(\d{4})/)
            return m ? `${m[2]}-${m[1]}` : r.ficheiro_origem_identificacao
          })()
        : periodoCorrente

      const tipo      = r.ficheiro_origem_identificacao ? 'Acerto' : 'Corrente'
      const gestao    = Number(r.valor_gestao).toFixed(2).replace('.', ',')
      const limpeza   = Number(r.valor_limpeza).toFixed(2).replace('.', ',')
      const total     = Number(r.montante).toFixed(2).replace('.', ',')

      return [
        ficheiro.loja_nome,
        r.n_impar ?? '',
        `"${(r.condominio_nome || '').replace(/"/g, '""')}"`,
        r.iban_devedor ?? '',
        r.adc ?? '',
        periodo,
        tipo,
        gestao,
        limpeza,
        total,
      ].join(sep)
    })

    const csv = BOM + [cabecalho, ...linhas].join('\r\n')

    return new Response(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ficheiro.identificacao}.csv"`,
      },
    })

  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default dd