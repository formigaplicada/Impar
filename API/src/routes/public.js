import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { getMicrosoftToken } from '../lib/microsoft.js'

const pub = new Hono()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function uploadFotoSharePoint(env, photoBase64, tipo, condId, lojaId) {
  const token = await getMicrosoftToken(env)
  const sql   = neon(env.DATABASE_URL)

  const lojaRows = lojaId ? await sql`SELECT nome FROM lojas WHERE id = ${lojaId} LIMIT 1` : []
  const lojaNome = lojaRows[0]?.nome || 'SemLoja'

  const siteRes  = await fetch(`https://graph.microsoft.com/v1.0/sites/redeimparcond.sharepoint.com`, { headers: { Authorization: `Bearer ${token}` } })
  const siteData = await siteRes.json()
  const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteData.id}/drive`, { headers: { Authorization: `Bearer ${token}` } })
  const driveId  = (await driveRes.json()).id

  const base64Data = photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64
  const bytes      = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
  const nomeFile   = `${tipo}_${condId}_${Date.now()}.jpg`
  const pasta      = `Clientes/${lojaNome}/Fotos/${tipo}s/${nomeFile}`

  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${pasta}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: bytes }
  )
  if (!uploadRes.ok) throw new Error(`Upload foto HTTP ${uploadRes.status}`)
  const fileData = await uploadRes.json()
  return fileData.webUrl || null
}

async function enviarEmailGraph(env, para, assunto, corpo, cc) {
  const token = await getMicrosoftToken(env)
  const mensagem = {
    message: {
      subject: assunto,
      body: { contentType: 'Text', content: corpo },
      toRecipients: [{ emailAddress: { address: para } }],
      ...(cc ? { ccRecipients: cc.split(',').map(e => ({ emailAddress: { address: e.trim() } })).filter(e => e.emailAddress.address) } : {})
    },
    saveToSentItems: true
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/geral@impar.pt/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagem)
  })
  if (!res.ok) throw new Error(`Graph sendMail HTTP ${res.status}`)
}

async function enviarEmailLimpeza(env, d, lojaId) {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
  const assunto  = `✅ Limpeza registada — Condomínio ${d.condominio || 'N/A'}`
  const corpo    = ['Nova limpeza registada pelo sistema Ímpar.', '', `Condomínio: ${d.condominio || 'N/A'}`, `Hora: ${d.timestamp || 'N/A'}`, `Localização: ${mapsLink}`, `Foto: ${d.temFoto === 'true' ? '✅ Sim' : '❌ Não'}`].join('\n')
  await enviarEmailGraph(env, 'formigaplicada@gmail.com', assunto, corpo)
}

async function enviarEmailOcorrencia(env, ocId, d, condInfo, mapsLink) {
  const emailGestor = condInfo?.email_gestor || ''
  const assunto = `🚨 Nova Ocorrência ${ocId} — Condomínio ${d.condominio || 'N/A'}`
  const corpo   = [`ID: ${ocId}`, `Condomínio: ${d.condominio || 'N/A'}`, `Categoria: ${d.categoria || '—'}`, `Descrição: ${d.descricaoFinal || 'Sem descrição'}`, `Nome: ${d.nome || 'N/A'}`, `Telefone: ${d.telefone || '—'}`, `Email: ${d.email || '—'}`].join('\n')
  await enviarEmailGraph(env, 'formigaplicada@gmail.com', assunto, corpo, emailGestor)
}

async function enviarEmailConfirmacaoUtilizador(env, ocId, d, condInfo) {
  const emailGestor = condInfo?.email_gestor || ''
  const assunto = `Ocorrência registada — ${ocId}`
  const corpo   = [`Olá ${d.nome || ''},`, '', 'A sua ocorrência foi registada com sucesso.', '', `ID de referência: ${ocId}`, `Categoria: ${d.categoria || '—'}`, `Descrição: ${d.descricaoFinal || '—'}`, '', 'Ímpar — Gestão de Condomínios'].join('\n')
  await enviarEmailGraph(env, d.email, assunto, corpo, emailGestor)
}

// ── GET /qr ───────────────────────────────────────────────────────────────────

pub.get('/qr', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.html(`<!DOCTYPE html><html><body><p>QR Code inválido — ID em falta.</p></body></html>`, 400)

  const sql   = neon(c.env.DATABASE_URL)
  const idInt = parseInt(id, 10)
  let rows    = []

  try {
    if (!isNaN(idInt)) rows = await sql`SELECT nipc FROM condominios WHERE n_impar = ${idInt} AND ativo = true LIMIT 1`
    if (rows.length === 0) rows = await sql`SELECT nipc FROM condominios WHERE old_n_impar = ${id} AND ativo = true LIMIT 1`

    if (rows.length === 0 || !rows[0].nipc) {
      return c.html(`<!DOCTYPE html><html><body><p>Condomínio não encontrado.</p></body></html>`, 404)
    }
    return new Response(null, { status: 302, headers: { 'Location': `https://my.condexpress.com/?condominio=${encodeURIComponent(rows[0].nipc)}` } })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /condominio/info ──────────────────────────────────────────────────────

pub.get('/condominio/info', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ error: 'ID em falta' }, 400)

  const sql   = neon(c.env.DATABASE_URL)
  const idStr = String(id).trim()
  const idInt = parseInt(idStr, 10)
  let rows    = []

  try {
    if (idStr.length === 9 && !isNaN(idInt)) rows = await sql`SELECT nome, nipc, n_impar FROM condominios WHERE nipc = ${idStr} AND ativo = true LIMIT 1`
    if (rows.length === 0 && !isNaN(idInt)) rows = await sql`SELECT nome, nipc, n_impar FROM condominios WHERE n_impar = ${idInt} AND ativo = true LIMIT 1`
    if (rows.length === 0) rows = await sql`SELECT nome, nipc, n_impar FROM condominios WHERE old_n_impar = ${idStr} AND ativo = true LIMIT 1`
    if (rows.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)
    return c.json({ nome: rows[0].nome, nipc: rows[0].nipc, n_impar: rows[0].n_impar })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /public/categorias ────────────────────────────────────────────────────

pub.get('/categorias', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`SELECT id, nome, emoji FROM categorias WHERE ativo = true ORDER BY ordem ASC, nome ASC`
    return c.json({ categorias: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /public/validar-pin ───────────────────────────────────────────────────

pub.get('/validar-pin', async (c) => {
  const pin = c.req.query('pin')
  if (!pin) return c.json({ valido: false, user: '' })
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`SELECT nome FROM utilizadores WHERE pin = ${pin.trim()} AND ativo = true LIMIT 1`
    if (rows.length === 0) return c.json({ valido: false, user: '' })
    return c.json({ valido: true, user: rows[0].nome })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /public/limpezas ─────────────────────────────────────────────────────

pub.post('/limpezas', async (c) => {
  try {
    let d
    try {
      const ct = c.req.header('Content-Type') || ''
      if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
        const form = await c.req.formData()
        d = Object.fromEntries(form.entries())
      } else {
        d = await c.req.json()
      }
    } catch {
      return c.json({ error: 'Body inválido' }, 400)
    }

    const sql    = neon(c.env.DATABASE_URL)
    const condId = String(d.condominio || '').trim()
    const idInt  = parseInt(condId, 10)
    let condRows = []

    if (condId.length === 9 && /^\d+$/.test(condId)) condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE nipc = ${condId} AND ativo = true LIMIT 1`
    if (condRows.length === 0 && !isNaN(idInt)) condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE n_impar = ${idInt}::integer AND ativo = true LIMIT 1`
    if (condRows.length === 0) condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE old_n_impar = ${condId} AND ativo = true LIMIT 1`
    if (condRows.length === 0) return c.json({ error: 'Condomínio não encontrado: ' + condId }, 404)

    const condominioId = condRows[0]?.n_impar || null
    const lojaId       = condRows[0]?.loja_id  || null

    let fotoUrl = d.fotoUrl || null
    if (d.photoBase64 && d.photoBase64.length > 100) {
      try { fotoUrl = await uploadFotoSharePoint(c.env, d.photoBase64, 'Limpeza', condId, lojaId) } catch (_) {}
    }

    const mapsLink  = d.mapsLink || (d.latitude && d.longitude ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}` : null)
    const tsCheckin = d.timestamp ? new Date(d.timestamp.split(', ').reverse().join('T') + ':00') : new Date()

    await sql`
      INSERT INTO limpezas (condominio_id, loja_id, latitude, longitude, precisao_m, maps_link, tem_foto, foto_url, pin_validado, ts_checkin)
      VALUES (${condominioId}, ${lojaId}, ${parseFloat(d.latitude) || null}, ${parseFloat(d.longitude) || null}, ${parseFloat(d.accuracy) || null}, ${mapsLink}, ${d.temFoto === 'true' || !!fotoUrl}, ${fotoUrl}, true, NOW())
    `
    try { await enviarEmailLimpeza(c.env, d, lojaId) } catch (_) {}

    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// ── POST /public/ocorrencias ──────────────────────────────────────────────────

pub.post('/ocorrencias', async (c) => {
  try {
    let d
    try {
      const ct = c.req.header('Content-Type') || ''
      if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
        const form = await c.req.formData()
        d = Object.fromEntries(form.entries())
      } else {
        d = await c.req.json()
      }
    } catch {
      return c.json({ error: 'Body inválido' }, 400)
    }

    const sql    = neon(c.env.DATABASE_URL)
    const condId = String(d.condominio || '').trim()
    const idInt  = parseInt(condId, 10)
    let condRows = []

    if (condId.length === 9 && /^\d+$/.test(condId)) condRows = await sql`SELECT id, n_impar, loja_id, morada FROM condominios WHERE nipc = ${condId} AND ativo = true LIMIT 1`
    if (condRows.length === 0 && !isNaN(idInt)) condRows = await sql`SELECT id, n_impar, loja_id, morada FROM condominios WHERE n_impar = ${idInt}::integer AND ativo = true LIMIT 1`
    if (condRows.length === 0) condRows = await sql`SELECT id, n_impar, loja_id, morada FROM condominios WHERE old_n_impar = ${condId} AND ativo = true LIMIT 1`
    if (condRows.length === 0) return c.json({ error: 'Condomínio não encontrado: ' + condId }, 404)

    const condominioId = condRows[0]?.n_impar || null
    const lojaId       = condRows[0]?.loja_id  || null
    const morada       = condRows[0]?.morada   || null

    let fotoUrl = d.fotoUrl || null
    if (d.photoBase64 && d.photoBase64.length > 100) {
      try { fotoUrl = await uploadFotoSharePoint(c.env, d.photoBase64, 'Ocorrencia', condId, lojaId) } catch (_) {}
    }

    const mapsLink = d.mapsLink || (d.latitude && d.longitude ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}` : null)

    let categoriaId = null
    if (d.categoria) {
      const catRows = await sql`SELECT id FROM categorias WHERE nome = ${d.categoria} AND ativo = true LIMIT 1`
      categoriaId = catRows[0]?.id || null
    }

    const ocId = d.ocId || `OC-${condId}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000)+1000}`

    await sql`
      INSERT INTO ocorrencias (id, condominio_id, loja_id, morada, categoria_id, categoria_texto, descricao_ai, descricao_final, latitude, longitude, maps_link, nome_reportante, telefone_reportante, email_reportante, status, tem_foto, foto_url, ts_registo)
      VALUES (${ocId}, ${condominioId}, ${lojaId}, ${morada}, ${categoriaId}, ${d.categoria || null}, ${d.descricaoAI || null}, ${d.descricaoFinal || null}, ${parseFloat(d.latitude) || null}, ${parseFloat(d.longitude) || null}, ${mapsLink}, ${d.nome || null}, ${d.telefone || null}, ${d.email || null}, 'aberta', ${d.temFoto === 'true' || !!fotoUrl}, ${fotoUrl}, NOW())
    `

    try {
      await enviarEmailOcorrencia(c.env, ocId, d, condRows[0], mapsLink)
      if (d.email) await enviarEmailConfirmacaoUtilizador(c.env, ocId, d, condRows[0])
    } catch (_) {}

    return c.json({ ok: true, ocId })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// ── POST /analyze-image (público) ────────────────────────────────────────────

pub.post('/analyze-image', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body inválido' }, 400)
  }

  let messages

  if (body.prompt) {
    messages = [{ role: 'user', content: body.prompt }]
  } else if (body.imageBase64) {
    const base64Data = body.imageBase64.includes(',') ? body.imageBase64.split(',')[1] : body.imageBase64
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } },
        { type: 'text', text: 'És um assistente de gestão de condomínios. Analisa esta foto e descreve de forma clara e objetiva a ocorrência ou problema que está visível, em português europeu. Sê conciso (máximo 2 frases).' }
      ]
    }]
  } else {
    return c.json({ error: 'Parâmetros em falta' }, 400)
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': c.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages })
    })
    const data = await response.json()
    if (!response.ok) return c.json({ error: 'Erro da API Anthropic', detail: data }, 502)
    return c.json({ descricao: data.content?.[0]?.text || 'Não foi possível analisar.' })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default pub
