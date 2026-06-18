import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'
import { getMicrosoftToken } from '../lib/microsoft.js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const dd = new Hono()

// ── Helpers PAIN.001 ──────────────────────────────────────────────────────────

function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function extrairTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))
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
}

function gerarPain001(creditor, batch, transactions) {
  const now      = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const msgId    = `IMPAR-${batch.id}-${Date.now()}`
  const totalTxs = transactions.length
  const totalValor = transactions.reduce((s, t) => s + parseFloat(t.valor), 0).toFixed(2)

  const grupos = {}
  for (const tx of transactions) {
    if (!grupos[tx.sequencia]) grupos[tx.sequencia] = []
    grupos[tx.sequencia].push(tx)
  }

  const pmtInfBlocks = Object.entries(grupos).map(([seq, txs]) => {
    const pmtInfId = `${msgId}-${seq}`
    const pmtValor = txs.reduce((s, t) => s + parseFloat(t.valor), 0).toFixed(2)

    const drctDbtTxInf = txs.map(tx => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>${escapeXml(tx.end_to_end_id)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(tx.valor).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(tx.adc)}</MndtId>
            <DtOfSgntr>${tx.data_assinatura}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
        <Dbtr><Nm>${escapeXml(tx.condominio_nome)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${escapeXml(tx.iban_devedor)}</IBAN></Id></DbtrAcct>
        ${tx.descricao ? `<RmtInf><Ustrd>${escapeXml(tx.descricao)}</Ustrd></RmtInf>` : ''}
      </DrctDbtTxInf>`).join('')

    return `
  <PmtInf>
    <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
    <PmtMtd>DD</PmtMtd>
    <NbOfTxs>${txs.length}</NbOfTxs>
    <CtrlSum>${pmtValor}</CtrlSum>
    <PmtTpInf>
      <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      <LclInstrm><Cd>CORE</Cd></LclInstrm>
      <SeqTp>${seq}</SeqTp>
    </PmtTpInf>
    <ReqdColltnDt>${batch.data_execucao}</ReqdColltnDt>
    <Cdtr><Nm>${escapeXml(creditor.nome)}</Nm></Cdtr>
    <CdtrAcct><Id><IBAN>${escapeXml(creditor.iban)}</IBAN></Id></CdtrAcct>
    <CdtrAgt><FinInstnId><BIC>${escapeXml(creditor.bic)}</BIC></FinInstnId></CdtrAgt>
    <CdtrSchmeId>
      <Id><PrvtId><Othr>
        <Id>${escapeXml(creditor.creditor_identifier)}</Id>
        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
      </Othr></PrvtId></Id>
    </CdtrSchmeId>
    ${drctDbtTxInf}
  </PmtInf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.003.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.003.02 pain.008.003.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${totalTxs}</NbOfTxs>
      <CtrlSum>${totalValor}</CtrlSum>
      <InitgPty><Nm>${escapeXml(creditor.nome)}</Nm></InitgPty>
    </GrpHdr>
    ${pmtInfBlocks}
  </CstmrDrctDbtInitn>
</Document>`
}

function parsePain002(xmlText) {
  const devolvidos = []
  const txBlocks = xmlText.match(/<TxInfAndSts>[\s\S]*?<\/TxInfAndSts>/g) || []

  for (const block of txBlocks) {
    const endToEndId    = extrairTag(block, 'OrgnlEndToEndId')
    const reasonCode    = extrairTag(block, 'Cd') || extrairTag(block, 'Prtry')
    const dataDevolucao = extrairTag(block, 'AccptncDtTm')?.substring(0, 10)
      || new Date().toISOString().substring(0, 10)

    if (!endToEndId || !reasonCode) continue

    devolvidos.push({
      end_to_end_id:       endToEndId,
      reason_code:         reasonCode,
      reason_description:  SEPA_REASON_CODES[reasonCode] || `Código ${reasonCode}`,
      data_devolucao:      dataDevolucao,
      raw_xml:             block,
    })
  }
  return devolvidos
}

// ── Helpers DD assinatura ─────────────────────────────────────────────────────

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

// ── POST /dd/lotes ────────────────────────────────────────────────────────────

dd.post('/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const { periodo, data_execucao, condominio_ids } = await c.req.json()
  if (!periodo || !data_execucao) return c.json({ error: 'periodo e data_execucao são obrigatórios' }, 400)
  if (!/^\d{4}-\d{2}$/.test(periodo)) return c.json({ error: 'periodo deve ter formato YYYY-MM' }, 400)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_execucao)) return c.json({ error: 'data_execucao deve ter formato YYYY-MM-DD' }, 400)

  const sql = neon(c.env.DATABASE_URL)

  try {
    const loteExistente = await sql`SELECT id FROM dd_batches WHERE periodo = ${periodo}`
    if (loteExistente.length > 0) return c.json({ error: `Já existe um lote para o período ${periodo}` }, 409)

    const creditorRows = await sql`SELECT * FROM dd_creditor LIMIT 1`
    if (creditorRows.length === 0) return c.json({ error: 'Creditor não configurado' }, 500)
    const creditor = creditorRows[0]

    const condominios = condominio_ids && condominio_ids.length > 0
      ? await sql`
          SELECT c.id, c.nome, c.nipc, m.id as mandato_id, m.adc, m.data_assinatura, m.iban as iban_devedor
          FROM condominios c JOIN mandatos m ON m.condominio_id = c.id
          WHERE c.ativo = true AND m.estado = 'ativo' AND c.id = ANY(${condominio_ids}) ORDER BY c.nome
        `
      : await sql`
          SELECT c.id, c.nome, c.nipc, m.id as mandato_id, m.adc, m.data_assinatura, m.iban as iban_devedor
          FROM condominios c JOIN mandatos m ON m.condominio_id = c.id
          WHERE c.ativo = true AND m.estado = 'ativo' ORDER BY c.nome
        `

    if (condominios.length === 0) return c.json({ error: 'Nenhum condomínio com mandato ativo encontrado' }, 400)

    const mandatoIds = condominios.map(c => c.mandato_id)
    const mandatosComHistorico = await sql`
      SELECT DISTINCT mandato_id FROM dd_transactions WHERE mandato_id = ANY(${mandatoIds}) AND estado = 'cobrado'
    `
    const mandatosRCUR = new Set(mandatosComHistorico.map(r => r.mandato_id))

    const referencia = `IMPAR-${periodo}`
    const batchRows = await sql`
      INSERT INTO dd_batches (referencia, periodo, data_execucao, estado)
      VALUES (${referencia}, ${periodo}, ${data_execucao}, 'rascunho') RETURNING *
    `
    const batch = batchRows[0]

    let totalValor = 0
    const txsParaXml = []

    for (const cond of condominios) {
      const sequencia  = mandatosRCUR.has(cond.mandato_id) ? 'RCUR' : 'FRST'
      const endToEndId = `IMPAR-${batch.id}-${cond.id}-${periodo.replace('-', '')}`
      const descricao  = `Quota ${periodo} - ${cond.nome}`
      const valor      = parseFloat(cond.quota_mensal || 0)
      if (valor <= 0) continue

      await sql`
        INSERT INTO dd_transactions (batch_id, condominio_id, mandato_id, sequencia, valor, descricao, end_to_end_id, estado)
        VALUES (${batch.id}, ${cond.id}, ${cond.mandato_id}, ${sequencia}, ${valor}, ${descricao}, ${endToEndId}, 'pendente')
      `
      totalValor += valor
      txsParaXml.push({ ...cond, sequencia, end_to_end_id: endToEndId, descricao, valor, condominio_nome: cond.nome })
    }

    await sql`
      UPDATE dd_batches SET total_transacoes = ${txsParaXml.length}, total_valor = ${totalValor.toFixed(2)}, atualizado_em = NOW()
      WHERE id = ${batch.id}
    `

    const xmlContent = gerarPain001(creditor, batch, txsParaXml)
    await sql`UPDATE dd_batches SET pain001_xml = ${xmlContent}, estado = 'gerado', atualizado_em = NOW() WHERE id = ${batch.id}`

    return c.json({ ok: true, batch_id: batch.id, referencia, total_transacoes: txsParaXml.length, total_valor: totalValor.toFixed(2) }, 201)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/lotes ─────────────────────────────────────────────────────────────

dd.get('/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)

  try {
    const rows = await sql`
      SELECT b.id, b.referencia, b.periodo, b.data_execucao,
             b.total_transacoes, b.total_valor, b.estado, b.criado_em, b.atualizado_em,
             COUNT(r.id) as total_devolucoes,
             COALESCE(SUM(CASE WHEN t.estado = 'cobrado'   THEN t.valor END), 0) as valor_cobrado,
             COALESCE(SUM(CASE WHEN t.estado = 'devolvido' THEN t.valor END), 0) as valor_devolvido
      FROM dd_batches b
      LEFT JOIN dd_transactions t ON t.batch_id = b.id
      LEFT JOIN dd_returns r ON r.batch_id = b.id
      GROUP BY b.id ORDER BY b.criado_em DESC LIMIT 50
    `
    return c.json({ lotes: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/lotes/:id ─────────────────────────────────────────────────────────

dd.get('/lotes/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const batchRows = await sql`SELECT * FROM dd_batches WHERE id = ${id}`
    if (batchRows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)

    const transacoes = await sql`
      SELECT t.id, t.sequencia, t.valor, t.descricao, t.end_to_end_id, t.estado, t.criado_em, t.atualizado_em,
             c.nome as condominio_nome, c.nipc, c.id as condominio_id,
             r.reason_code, r.reason_description, r.data_devolucao
      FROM dd_transactions t JOIN condominios c ON c.id = t.condominio_id
      LEFT JOIN dd_returns r ON r.transaction_id = t.id
      WHERE t.batch_id = ${id} ORDER BY c.nome
    `
    return c.json({ lote: batchRows[0], transacoes })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── PUT /dd/lotes/:id/estado ──────────────────────────────────────────────────

dd.put('/lotes/:id/estado', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))
  const { estado } = await c.req.json()

  const estados_validos = ['rascunho', 'gerado', 'submetido', 'processado']
  if (!estados_validos.includes(estado)) return c.json({ error: 'Estado inválido' }, 400)

  try {
    const rows = await sql`SELECT id FROM dd_batches WHERE id = ${id}`
    if (rows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)
    await sql`UPDATE dd_batches SET estado = ${estado}, atualizado_em = NOW() WHERE id = ${id}`
    return c.json({ ok: true, estado })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/lotes/:id/pain001 ─────────────────────────────────────────────────

dd.get('/lotes/:id/pain001', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const rows = await sql`SELECT referencia, pain001_xml FROM dd_batches WHERE id = ${id}`
    if (rows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)
    if (!rows[0].pain001_xml) return c.json({ error: 'PAIN.001 ainda não gerado' }, 400)
    return new Response(rows[0].pain001_xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${rows[0].referencia}-PAIN001.xml"`,
      },
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /dd/lotes/:id/pain002 ────────────────────────────────────────────────

dd.post('/lotes/:id/pain002', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))

  try {
    const batchRows = await sql`SELECT id FROM dd_batches WHERE id = ${id}`
    if (batchRows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)

    const { xml } = await c.req.json()
    if (!xml) return c.json({ error: 'xml é obrigatório no body' }, 400)

    const devolvidos = parsePain002(xml)
    if (devolvidos.length === 0) return c.json({ error: 'Nenhuma devolução encontrada no PAIN.002' }, 400)

    let processados = 0, naoEncontrados = 0

    for (const dev of devolvidos) {
      const txRows = await sql`
        SELECT t.id, c.nome, c.email_gestor FROM dd_transactions t JOIN condominios c ON c.id = t.condominio_id
        WHERE t.end_to_end_id = ${dev.end_to_end_id} AND t.batch_id = ${id}
      `
      if (txRows.length === 0) {
        naoEncontrados++
        await sql`
          INSERT INTO dd_returns (batch_id, end_to_end_id, reason_code, reason_description, data_devolucao, raw_xml)
          VALUES (${id}, ${dev.end_to_end_id}, ${dev.reason_code}, ${dev.reason_description}, ${dev.data_devolucao}, ${dev.raw_xml})
        `
        continue
      }
      const tx = txRows[0]
      await sql`
        INSERT INTO dd_returns (batch_id, transaction_id, end_to_end_id, reason_code, reason_description, data_devolucao, raw_xml)
        VALUES (${id}, ${tx.id}, ${dev.end_to_end_id}, ${dev.reason_code}, ${dev.reason_description}, ${dev.data_devolucao}, ${dev.raw_xml})
      `
      await sql`UPDATE dd_transactions SET estado = 'devolvido', atualizado_em = NOW() WHERE id = ${tx.id}`
      if (tx.email_gestor) {
        await sql`
          INSERT INTO dd_notifications (transaction_id, batch_id, tipo, destinatario, assunto, estado)
          VALUES (${tx.id}, ${id}, 'devolucao', ${tx.email_gestor}, ${`Débito devolvido — ${tx.nome} — ${dev.reason_description}`}, 'pendente')
        `
      }
      processados++
    }

    await sql`UPDATE dd_transactions SET estado = 'cobrado', atualizado_em = NOW() WHERE batch_id = ${id} AND estado = 'pendente'`
    await sql`UPDATE dd_batches SET estado = 'processado', atualizado_em = NOW() WHERE id = ${id}`

    return c.json({ ok: true, devolvidos: processados, nao_encontrados: naoEncontrados, total_no_ficheiro: devolvidos.length })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/lotes/:id/transacoes ──────────────────────────────────────────────

dd.get('/lotes/:id/transacoes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)
  const id  = parseInt(c.req.param('id'))
  const { estado } = c.req.query()

  try {
    const rows = await sql`
      SELECT t.id, t.sequencia, t.valor, t.descricao, t.end_to_end_id, t.estado,
             c.nome as condominio_nome, c.nipc, c.iban,
             r.reason_code, r.reason_description, r.data_devolucao
      FROM dd_transactions t JOIN condominios c ON c.id = t.condominio_id
      LEFT JOIN dd_returns r ON r.transaction_id = t.id
      WHERE t.batch_id = ${id}
        ${estado ? sql`AND t.estado = ${estado}` : sql``}
      ORDER BY c.nome
    `
    return c.json({ transacoes: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/dashboard ─────────────────────────────────────────────────────────

dd.get('/dashboard', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)

  try {
    const [resumo, ultimosLotes, topDevolucoes] = await Promise.all([
      sql`
        SELECT COUNT(DISTINCT b.id) as total_lotes,
               COALESCE(SUM(CASE WHEN t.estado = 'cobrado'   THEN t.valor END), 0) as total_cobrado,
               COALESCE(SUM(CASE WHEN t.estado = 'devolvido' THEN t.valor END), 0) as total_devolvido,
               COALESCE(SUM(CASE WHEN t.estado = 'pendente'  THEN t.valor END), 0) as total_pendente,
               COUNT(CASE WHEN t.estado = 'devolvido' THEN 1 END) as num_devolucoes
        FROM dd_batches b LEFT JOIN dd_transactions t ON t.batch_id = b.id
      `,
      sql`SELECT id, referencia, periodo, data_execucao, total_transacoes, total_valor, estado FROM dd_batches ORDER BY criado_em DESC LIMIT 6`,
      sql`SELECT reason_code, reason_description, COUNT(*) as ocorrencias FROM dd_returns GROUP BY reason_code, reason_description ORDER BY ocorrencias DESC LIMIT 10`,
    ])
    return c.json({ resumo: resumo[0], ultimos_lotes: ultimosLotes, top_devolucoes: topDevolucoes })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /dd/mandatos/create ──────────────────────────────────────────────────

dd.post('/mandatos/create', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { condominio_id, nome_devedor, email_devedor, iban, adc } = body

  if (!condominio_id || !nome_devedor || !email_devedor || !adc) {
    return c.json({ error: 'Campos obrigatórios: condominio_id, nome_devedor, email_devedor, adc' }, 400)
  }

  try {
    const token     = gerarTokenDD()
    const expiresAt = expiresAtDD(7)

    const rows = await sql`
      INSERT INTO mandatos_dd (condominio_id, adc, iban, data_assinatura, estado, token, token_expires_at, nome_devedor, email_devedor)
      VALUES (${condominio_id}, ${adc}, ${iban || ''}, CURRENT_DATE, 'pendente', ${token}, ${expiresAt}, ${nome_devedor}, ${email_devedor})
      RETURNING id, token, adc
    `
    const mandato = rows[0]
    const link    = `${c.env.DD_BASE_URL}/dd/assinar?t=${token}`

    await enviarEmailMandato(c.env, { to: email_devedor, nome: nome_devedor, link, adc, expiresAt: new Date(expiresAt) })

    return c.json({ id: mandato.id, token: mandato.token, link, adc: mandato.adc, email: email_devedor })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/assinar/:token (público) ─────────────────────────────────────────

dd.get('/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  try {
    const rows = await sql`
      SELECT m.id, m.adc, m.iban, m.estado, m.nome_devedor, m.email_devedor, m.token_expires_at, m.signed_at,
             cond.nome AS condominio_nome, cond.morada AS condominio_morada, cond.codigo_postal AS condominio_cp, cond.cidade AS condominio_cidade,
             b.nome AS banco_nome, b.bic AS banco_bic,
             cr.nome AS credor_nome, cr.creditor_identifier AS credor_id, cr.morada AS credor_morada, cr.codigo_postal AS credor_cp, cr.cidade AS credor_cidade
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
      adc: m.adc, iban: m.iban ? formatIBANDD(m.iban) : '', bic: m.banco_bic || '', nome_devedor: m.nome_devedor,
      condominio: { nome: m.condominio_nome, morada: m.condominio_morada, cod_postal: m.condominio_cp, cidade: m.condominio_cidade },
      credor: { nome: m.credor_nome || 'Rede Impar, Lda', identifier: m.credor_id || 'PT18ZZZ114843', morada: m.credor_morada || '', cod_postal: m.credor_cp || '', cidade: m.credor_cidade || '' },
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /dd/assinar/:token (público) ────────────────────────────────────────

dd.post('/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')
  const ip    = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const body  = await c.req.json()
  const { iban, bic, banco_id, nome_devedor, signature_png } = body

  if (!signature_png || !nome_devedor) return c.json({ error: 'Campos obrigatórios: nome_devedor, signature_png' }, 400)

  try {
    const rows = await sql`
      SELECT m.*, cond.nome AS condo_nome, cond.morada, cond.codigo_postal, cond.cidade,
             cr.nome AS credor_nome, cr.creditor_identifier, cr.morada AS credor_morada, cr.codigo_postal AS credor_cp, cr.cidade AS credor_cidade,
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
      adc: m.adc, nomeDevedor: nome_devedor, moradaDevedor: m.morada || '', cpDevedor: m.codigo_postal || '', cidadeDevedor: m.cidade || '',
      credorNome: m.credor_nome || 'Rede Impar, Lda', credorId: m.creditor_identifier || 'PT18ZZZ114843',
      credorMorada: m.credor_morada || '', credorCp: m.credor_cp || '', credorCidade: m.credor_cidade || '',
      iban: ibanClean, bic: finalBic, signaturePng: signature_png, signedAt, signedIp: ip,
    })

    const pdfUrl = await uploadMandatoPDF(c.env, m.condominio_id, m.adc, pdfBytes)

    await sql`
      UPDATE mandatos_dd SET iban = ${ibanClean}, banco_id = ${banco_id || m.banco_id}, nome_devedor = ${nome_devedor},
        signature_png = ${signature_png}, signed_at = ${signedAt.toISOString()}, signed_ip = ${ip},
        pdf_url = ${pdfUrl}, estado = 'activo', data_assinatura = CURRENT_DATE, atualizado_em = NOW()
      WHERE token = ${token}
    `

    await enviarEmailConfirmacao(c.env, { toCliente: m.email_devedor, nomeCliente: nome_devedor, adc: m.adc, signedAt })

    return c.json({ success: true, adc: m.adc })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /dd/bancos (público) ──────────────────────────────────────────────────

dd.get('/bancos', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`SELECT id, nome, bic FROM bancos ORDER BY nome`
    return c.json(rows)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default dd
