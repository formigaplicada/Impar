import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth, generateSessionToken } from '../lib/auth.js'
import { getMicrosoftToken, syncCondominioOneDrive, syncLojaOneDrive, syncTodasAsLojas } from '../lib/microsoft.js'

const admin = new Hono()

// ── GET /utilizadores ─────────────────────────────────────────────────────────

admin.get('/utilizadores', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql = neon(c.env.DATABASE_URL)

  try {
    const rows = await sql`
      SELECT u.id, u.nome, u.email, u.role, l.nome as loja_nome
      FROM utilizadores u LEFT JOIN lojas l ON l.id = u.loja_id
      WHERE u.role != 'admin' AND u.ativo = true ORDER BY u.nome ASC
    `
    return c.json({ utilizadores: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/impersonate/:utilizador_id ────────────────────────────────────

admin.post('/impersonate/:utilizador_id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
  const sql           = neon(c.env.DATABASE_URL)
  const utilizador_id = c.req.param('utilizador_id')

  try {
    const target = await sql`
      SELECT id, nome, email, role, loja_id FROM utilizadores
      WHERE id = ${utilizador_id} AND role != 'admin' AND ativo = true
    `
    if (target.length === 0) return c.json({ error: 'Utilizador não encontrado' }, 404)

    const authHeader = c.req.header('Authorization') || ''
    const adminToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    const token  = generateSessionToken()
    const expira = new Date(Date.now() + 8 * 60 * 60 * 1000)

    await sql`
      INSERT INTO sessoes (id, utilizador_id, token, expira_em, impersonator_id)
      VALUES (${generateSessionToken()}, ${utilizador_id}, ${token}, ${expira.toISOString()}, ${user.id})
    `
    await sql`
      INSERT INTO audit_log (utilizador_id, acao, tabela, registo_id, payload)
      VALUES (${user.id}, 'impersonate.start', 'utilizadores', ${utilizador_id}, ${JSON.stringify({ target_nome: target[0].nome, target_email: target[0].email })})
    `
    return c.json({ ok: true, token, admin_token: adminToken })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/impersonate/stop ──────────────────────────────────────────────

admin.post('/impersonate/stop', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')

  try {
    const authHeader   = c.req.header('Authorization') || ''
    const currentToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    const sessao = await sql`SELECT impersonator_id FROM sessoes WHERE token = ${currentToken}`
    if (!sessao[0]?.impersonator_id) return c.json({ error: 'Não está em modo impersonate' }, 400)

    const impersonator_id = sessao[0].impersonator_id
    await sql`INSERT INTO audit_log (utilizador_id, acao, tabela, registo_id) VALUES (${impersonator_id}, 'impersonate.stop', 'utilizadores', ${user.id})`
    await sql`DELETE FROM sessoes WHERE token = ${currentToken}`

    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /lojas ────────────────────────────────────────────────────────────────

admin.get('/lojas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`
      SELECT id, codigo, nome, gestor, email, telefone, morada, proximo_n_impar, onedrive_activos_folder_id
      FROM lojas WHERE ativo = true ORDER BY nome ASC
    `
    return c.json({ lojas: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/lojas/:id/sync-onedrive ──────────────────────────────────────

admin.post('/lojas/:id/sync-onedrive', requireAuth, async (c) => {
  const sql    = neon(c.env.DATABASE_URL)
  const lojaId = c.req.param('id')

  try {
    const rows = await sql`SELECT id, nome, onedrive_activos_folder_id FROM lojas WHERE id = ${lojaId} AND ativo = true`
    if (rows.length === 0) return c.json({ error: 'Loja não encontrada' }, 404)

    const token = await getMicrosoftToken(c.env)
    const res   = await syncLojaOneDrive({ token, loja: rows[0], sql })
    return c.json(res)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/lojas/sync-onedrive (todas) ───────────────────────────────────

admin.post('/lojas/sync-onedrive', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const res = await syncTodasAsLojas(c.env, sql)
    return c.json(res)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/onedrive/sync (todos os condomínios sem pasta) ────────────────

admin.post('/onedrive/sync', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)

  try {
    const condominios = await sql`
      SELECT c.id, c.n_impar, c.old_n_impar, c.nome,
             l.id AS loja_id, l.nome AS loja_nome, l.onedrive_activos_folder_id
      FROM condominios c JOIN lojas l ON l.id = c.loja_id
      WHERE c.onedrive_folder_id IS NULL AND c.ativo = true
      ORDER BY l.id, c.n_impar
    `
    if (condominios.length === 0) {
      return c.json({ ok: true, message: 'Nenhum condomínio por sincronizar.', mapeados: 0, nao_encontrados: 0, erros: 0, sem_pasta_loja: 0, detalhes: [] })
    }

    const token      = await getMicrosoftToken(c.env)
    const pastaCache = new Map()
    const resultados = { mapeados: 0, nao_encontrados: 0, erros: 0, sem_pasta_loja: 0, detalhes: [] }

    for (const cond of condominios) {
      const loja       = { id: cond.loja_id, nome: cond.loja_nome, onedrive_activos_folder_id: cond.onedrive_activos_folder_id }
      const condominio = { id: cond.id, n_impar: cond.n_impar, old_n_impar: cond.old_n_impar }
      const res        = await syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql })

      if      (res.ok)                       resultados.mapeados++
      else if (res.reason === 'no_activos_folder') resultados.sem_pasta_loja++
      else if (res.reason === 'not_found')   resultados.nao_encontrados++
      else                                   resultados.erros++

      resultados.detalhes.push({ n_impar: cond.n_impar, nome: cond.nome, loja: cond.loja_nome, resultado: res.ok ? 'mapeado' : res.reason, folder_name: res.folder_name || null, error: res.error || null })
    }

    return c.json({ ok: true, ...resultados })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /admin/onedrive/sync/:condominio_id ──────────────────────────────────

admin.post('/onedrive/sync/:condominio_id', requireAuth, async (c) => {
  const sql          = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('condominio_id')

  try {
    const rows = await sql`
      SELECT c.id, c.n_impar, c.old_n_impar, c.nome,
             l.id AS loja_id, l.nome AS loja_nome, l.onedrive_activos_folder_id
      FROM condominios c JOIN lojas l ON l.id = c.loja_id WHERE c.id = ${condominioId}
    `
    if (rows.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

    const cond       = rows[0]
    const loja       = { id: cond.loja_id, nome: cond.loja_nome, onedrive_activos_folder_id: cond.onedrive_activos_folder_id }
    const condominio = { id: cond.id, n_impar: cond.n_impar, old_n_impar: cond.old_n_impar }
    const token      = await getMicrosoftToken(c.env)
    const pastaCache = new Map()
    const res        = await syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql })

    if (res.ok) return c.json({ ok: true, folder_id: res.folder_id, folder_name: res.folder_name })
    return c.json({ ok: false, reason: res.reason, error: res.error || null }, res.reason === 'api_error' ? 502 : 200)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default admin
