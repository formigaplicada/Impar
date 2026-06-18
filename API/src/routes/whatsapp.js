import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'
import { getMicrosoftToken } from '../lib/microsoft.js'

const whatsapp = new Hono()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downloadWhatsAppMediaToSharePoint(mediaId, mimeType, env) {
  const metaRes = await fetch(
    `https://graph.facebook.com/v25.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }
  )
  if (!metaRes.ok) throw new Error(`Meta media lookup falhou: ${metaRes.status}`)
  const metaData = await metaRes.json()
  const mediaUrl = metaData.url
  if (!mediaUrl) throw new Error('URL de media não encontrado na resposta da Meta')

  const fileRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } })
  if (!fileRes.ok) throw new Error(`Download do media falhou: ${fileRes.status}`)
  const fileBuffer = await fileRes.arrayBuffer()

  const extMap = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  const ext = extMap[mimeType] || 'bin'
  const nomeFicheiro = `${mediaId}_${Date.now()}.${ext}`

  const msToken = await getMicrosoftToken(env)
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${env.WHATSAPP_INBOX_DRIVE_ID}/items/${env.WHATSAPP_INBOX_FOLDER_ID}:/${nomeFicheiro}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': mimeType },
      body: fileBuffer,
    }
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.json()
    throw new Error(`Upload SharePoint falhou: ${err?.error?.message || uploadRes.status}`)
  }
  const uploadData = await uploadRes.json()
  return { sharepoint_url: uploadData.webUrl, nome_ficheiro: nomeFicheiro }
}

async function enviarMensagemWhatsApp(para, texto, env) {
  const res = await fetch(
    `https://graph.facebook.com/v25.0/${env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para, type: 'text', text: { body: texto },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Envio WhatsApp falhou: ${err?.error?.message || res.status}`)
  }
  return await res.json()
}

// ── GET /whatsapp/webhook (verificação Meta) ──────────────────────────────────

whatsapp.get('/webhook', (c) => {
  const mode      = c.req.query('hub.mode')
  const token     = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge, 200)
  }
  return c.json({ error: 'Verificação falhou' }, 403)
})

// ── POST /whatsapp/webhook (eventos Meta) ─────────────────────────────────────

whatsapp.post('/webhook', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.text('OK', 200)
  }

  const processar = async () => {
    try {
      const entry   = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value   = changes?.value
      if (!value) return

      // Updates de estado
      const statuses = value?.statuses || []
      for (const status of statuses) {
        const { id: canal_msg_id, status: estado } = status
        const estadoMap = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhada' }
        const novoEstado = estadoMap[estado]
        if (!novoEstado) continue
        await sql`
          UPDATE comunicacoes SET
            estado        = ${novoEstado},
            atualizado_em = NOW(),
            entregue_em   = CASE WHEN ${novoEstado} = 'entregue' THEN NOW() ELSE entregue_em END,
            lido_em       = CASE WHEN ${novoEstado} = 'lida'     THEN NOW() ELSE lido_em     END
          WHERE canal_msg_id = ${canal_msg_id} AND canal = 'whatsapp'
        `
      }

      // Mensagens recebidas
      const messages = value?.messages || []
      for (const msg of messages) {
        const canal_msg_id = msg.id
        const de           = msg.from
        const tipo_raw     = msg.type

        const existente = await sql`
          SELECT id FROM comunicacoes WHERE canal_msg_id = ${canal_msg_id} AND canal = 'whatsapp'
        `
        if (existente.length > 0) continue

        const tipoMap = {
          text: 'texto', image: 'imagem', document: 'documento',
          audio: 'audio', video: 'video', location: 'localizacao',
        }
        const tipo = tipoMap[tipo_raw] || 'texto'

        let conteudo = null, ficheiro_url = null, ficheiro_nome = null, ficheiro_mime = null

        if (tipo_raw === 'text') conteudo = msg.text?.body || ''

        if (['image', 'document', 'audio', 'video'].includes(tipo_raw)) {
          const mediaObj = msg[tipo_raw]
          const mediaId  = mediaObj?.id
          ficheiro_mime  = mediaObj?.mime_type || null
          ficheiro_nome  = mediaObj?.filename  || null
          if (mediaId) {
            try {
              const upload = await downloadWhatsAppMediaToSharePoint(mediaId, ficheiro_mime, c.env)
              ficheiro_url  = upload.sharepoint_url
              ficheiro_nome = ficheiro_nome || upload.nome_ficheiro
              conteudo      = ficheiro_nome
            } catch (err) {
              conteudo = `[Erro ao guardar ficheiro: ${err.message}]`
            }
          }
        }

        if (tipo_raw === 'location') {
          const loc = msg.location
          conteudo = `Localização: ${loc?.latitude}, ${loc?.longitude}`
          if (loc?.name)    conteudo += ` — ${loc.name}`
          if (loc?.address) conteudo += ` (${loc.address})`
        }

        await sql`
          INSERT INTO comunicacoes (
            canal, direcao, tipo, de, para,
            conteudo, ficheiro_url, ficheiro_nome, ficheiro_mime,
            estado, canal_msg_id, criado_em
          ) VALUES (
            'whatsapp', 'inbound', ${tipo},
            ${de}, ${c.env.WHATSAPP_PHONE_ID},
            ${conteudo}, ${ficheiro_url}, ${ficheiro_nome}, ${ficheiro_mime},
            'entregue', ${canal_msg_id}, NOW()
          )
        `
      }
    } catch (err) {
      console.error('Erro ao processar webhook WhatsApp:', err.message)
    }
  }

  c.executionCtx.waitUntil(processar())
  return c.text('OK', 200)
})

// ── POST /whatsapp/send ───────────────────────────────────────────────────────

whatsapp.post('/send', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Payload JSON inválido' }, 400)
  }

  const { para, texto, contexto_tipo, contexto_id } = body
  if (!para || !texto) return c.json({ error: 'para e texto são obrigatórios' }, 400)

  const numero = para.replace(/^\+/, '')
  let canal_msg_id = null

  try {
    const metaRes = await enviarMensagemWhatsApp(numero, texto, c.env)
    canal_msg_id  = metaRes?.messages?.[0]?.id || null
  } catch (err) {
    await sql`
      INSERT INTO comunicacoes (canal, direcao, tipo, de, para, conteudo, estado, contexto_tipo, contexto_id, utilizador_id)
      VALUES ('whatsapp', 'outbound', 'texto', ${c.env.WHATSAPP_PHONE_ID}, ${numero}, ${texto}, 'falhada', ${contexto_tipo || null}, ${contexto_id || null}, ${user.id})
    `
    return c.json({ error: `Falha ao enviar: ${err.message}` }, 502)
  }

  try {
    const rows = await sql`
      INSERT INTO comunicacoes (canal, direcao, tipo, de, para, conteudo, estado, canal_msg_id, contexto_tipo, contexto_id, utilizador_id)
      VALUES ('whatsapp', 'outbound', 'texto', ${c.env.WHATSAPP_PHONE_ID}, ${numero}, ${texto}, 'enviada', ${canal_msg_id}, ${contexto_tipo || null}, ${contexto_id || null}, ${user.id})
      RETURNING id
    `
    return c.json({ ok: true, id: rows[0].id, canal_msg_id })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /whatsapp/comunicacoes ────────────────────────────────────────────────

whatsapp.get('/comunicacoes', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { contexto_tipo, contexto_id, de, limit } = c.req.query()
  const maxRows = Math.min(parseInt(limit || '50'), 200)

  try {
    const rows = await sql`
      SELECT
        c.id, c.canal, c.direcao, c.tipo,
        c.de, c.para, c.conteudo,
        c.ficheiro_url, c.ficheiro_nome, c.ficheiro_mime,
        c.estado, c.canal_msg_id,
        c.contexto_tipo, c.contexto_id,
        c.criado_em, c.entregue_em, c.lido_em,
        u.nome as utilizador_nome
      FROM comunicacoes c
      LEFT JOIN utilizadores u ON u.id = c.utilizador_id
      WHERE c.canal = 'whatsapp'
        ${contexto_tipo ? sql`AND c.contexto_tipo = ${contexto_tipo}` : sql``}
        ${contexto_id   ? sql`AND c.contexto_id   = ${contexto_id}`   : sql``}
        ${de            ? sql`AND c.de            = ${de}`            : sql``}
      ORDER BY c.criado_em DESC
      LIMIT ${maxRows}
    `
    return c.json({ comunicacoes: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /whatsapp/cron/reunioes (trigger manual) ──────────────────────────────

whatsapp.get('/cron/reunioes', requireAuth, async (c) => {
  try {
    const resultado = await enviarAlertasReunioes(c.env)
    return c.json(resultado)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── Cron helper (exportado para uso no scheduled handler) ─────────────────────

export async function enviarAlertasReunioes(env) {
  const sql = neon(env.DATABASE_URL)

  const reunioes = await sql`
    SELECT
      e.id, e.tipo, e.tipo_reuniao,
      e.condominio_texto, e.localidade, e.local_evento,
      e.data_hora, e.formato,
      u.nome      AS utilizador_nome,
      u.telemovel AS utilizador_telemovel
    FROM eventos e
    LEFT JOIN utilizadores u ON u.id = COALESCE(e.gestor_id, e.criado_por)
    WHERE e.tipo = 'reuniao'
      AND e.data_hora >= (NOW() AT TIME ZONE 'Europe/Lisbon' + INTERVAL '1 day')::date
      AND e.data_hora <  (NOW() AT TIME ZONE 'Europe/Lisbon' + INTERVAL '2 days')::date
      AND u.telemovel IS NOT NULL AND u.telemovel != ''
      AND u.ativo = true
    ORDER BY e.data_hora ASC
  `

  if (reunioes.length === 0) {
    console.log('Cron reuniões: nenhuma reunião encontrada para amanhã')
    return { enviados: 0, erros: 0, total: 0 }
  }

  let enviados = 0, erros = 0

  for (const reuniao of reunioes) {
    const numero = reuniao.utilizador_telemovel
      .replace(/\s/g, '').replace(/^\+/, '').replace(/^00/, '')
      .replace(/^9/, '3519').replace(/^2/, '3512')

    const param1_evento  = [reuniao.tipo, reuniao.tipo_reuniao].filter(Boolean).join(' - ')
    const param2_empresa = 'Ímpar'
    const param3_morada  = [reuniao.local_evento, reuniao.localidade].filter(Boolean).join(', ')
    const dataHora       = new Date(reuniao.data_hora)
    const param4_horas   = dataHora.toLocaleString('pt-PT', {
      day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon',
    }).replace(',', ' às')

    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${env.WHATSAPP_PHONE_ID}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: numero, type: 'template',
            template: {
              name: 'evento_futuro',
              language: { code: 'pt_PT' },
              components: [{
                type: 'body',
                parameters: [
                  { type: 'text', parameter_name: 'evento',  text: param1_evento  },
                  { type: 'text', parameter_name: 'empresa', text: param2_empresa },
                  { type: 'text', parameter_name: 'morada',  text: param3_morada  },
                  { type: 'text', parameter_name: 'horas',   text: param4_horas   },
                ],
              }],
            },
          }),
        }
      )

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)

      const canal_msg_id = data?.messages?.[0]?.id || null
      await sql`
        INSERT INTO comunicacoes (canal, direcao, tipo, de, para, conteudo, estado, canal_msg_id, contexto_tipo, contexto_id)
        VALUES ('whatsapp', 'outbound', 'texto', ${env.WHATSAPP_PHONE_ID}, ${numero},
          ${`Alerta reunião: ${param1_evento} em ${param3_morada} — ${param4_horas}`},
          'enviada', ${canal_msg_id}, 'ocorrencia', ${reuniao.id})
      `
      console.log(`Alerta enviado para ${reuniao.utilizador_nome} (${numero}) — ${param1_evento}`)
      enviados++
    } catch (err) {
      console.error(`Erro ao enviar alerta para ${reuniao.utilizador_nome}: ${err.message}`)
      erros++
    }
  }

  return { enviados, erros, total: reunioes.length }
}

export default whatsapp
