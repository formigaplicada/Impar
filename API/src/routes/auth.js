import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth, generateSessionToken } from '../lib/auth.js'

const auth = new Hono()

// ── GET /auth/login ───────────────────────────────────────────────────────────

auth.get('/login', (c) => {
  const state = generateSessionToken().slice(0, 32)
  const params = new URLSearchParams({
    client_id:     c.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  'https://impar-api.formigaplicada.workers.dev/auth/callback',
    scope:         'openid email profile',
    state:         state,
    tenant:        c.env.MICROSOFT_TENANT_ID,
  })
  const url = `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`
  return new Response(null, { status: 302, headers: { 'Location': url } })
})

// ── GET /auth/callback ────────────────────────────────────────────────────────

auth.get('/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'Código em falta' }, 400)

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     c.env.MICROSOFT_CLIENT_ID,
        client_secret: c.env.MICROSOFT_CLIENT_SECRET,
        code:          code,
        redirect_uri:  'https://impar-api.formigaplicada.workers.dev/auth/callback',
        grant_type:    'authorization_code',
      })
    }
  )

  const tokens = await tokenRes.json()
  if (!tokens.access_token) return c.json({ error: 'Falha ao obter token', detail: tokens }, 401)

  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const profile = await profileRes.json()
  const email = profile.mail || profile.userPrincipalName || ''

  if (!email.endsWith('@impar.pt')) return c.json({ error: 'Acesso restrito a contas @impar.pt' }, 403)

  const sql = neon(c.env.DATABASE_URL)

  const existente = await sql`
    SELECT id, role FROM utilizadores WHERE email = ${email}
  `

  if (existente.length > 0) {
    await sql`
      UPDATE utilizadores SET ultimo_login = NOW(), nome = ${profile.displayName}
      WHERE email = ${email}
    `
  } else {
    await sql`
      INSERT INTO utilizadores (id, nome, email, email_verificado, role)
      VALUES (${profile.id}, ${profile.displayName}, ${email}, true, 'gestor_condominio')
    `
  }

  const userId = existente.length > 0 ? existente[0].id : profile.id

  const token = generateSessionToken()
  const expira = new Date(Date.now() + 8 * 60 * 60 * 1000)
  await sql`
    INSERT INTO sessoes (id, utilizador_id, token, expira_em)
    VALUES (${generateSessionToken()}, ${userId}, ${token}, ${expira.toISOString()})
  `

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://app.condexpress.com/backoffice?token=${token}`,
      'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=28800; Path=/`
    }
  })
})

// ── POST /auth/logout ─────────────────────────────────────────────────────────

auth.post('/logout', requireAuth, async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    const sql = neon(c.env.DATABASE_URL)
    await sql`DELETE FROM sessoes WHERE token = ${token}`
  }
  return c.json({ ok: true })
})

export default auth

// ── /health e /me são exportados separadamente para montar no root ────────────

export async function healthHandler(c) {
  const sql = neon(c.env.DATABASE_URL)
  const result = await sql`SELECT COUNT(*) as total FROM lojas`
  return c.json({ ok: true, lojas: Number(result[0].total) })
}

export async function meHandler(c) {
  const user = c.get('user')
  const sql = neon(c.env.DATABASE_URL)

  let impersonator = null
  if (user.impersonator_id) {
    const rows = await sql`SELECT nome FROM utilizadores WHERE id = ${user.impersonator_id}`
    impersonator = rows[0]?.nome || null
  }

  return c.json({ user: { ...user, impersonator_nome: impersonator } })
}
