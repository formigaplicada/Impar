import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'

const app = new Hono()

// CORS
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
  const allowed = [
    'http://localhost:5173',
    'https://impar.pages.dev'
  ]
  if (allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204)
  }
  await next()
})

// ── Utilitários ──────────────────────────────────────────────

function generateState() {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateSessionToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Health (público) ─────────────────────────────────────────

app.get('/health', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const result = await sql`SELECT COUNT(*) as total FROM lojas`
  return c.json({ ok: true, lojas: Number(result[0].total) })
})

// ── Login — redireciona para Microsoft ───────────────────────

app.get('/auth/login', (c) => {
  const state = generateState()
  const params = new URLSearchParams({
    client_id:     c.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  'https://impar-api.formigaplicada.workers.dev/auth/callback',
    scope:         'openid email profile',
    state:         state,
    tenant:        c.env.MICROSOFT_TENANT_ID,
  })

  const url = `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params}`

  return new Response(null, {
    status: 302,
    headers: { 'Location': url }
  })
})

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code')

  if (!code) {
    return c.json({ error: 'Código em falta' }, 400)
  }

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
  if (!tokens.access_token) {
    return c.json({ error: 'Falha ao obter token', detail: tokens }, 401)
  }

  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const profile = await profileRes.json()
  const email = profile.mail || profile.userPrincipalName || profile.email || ''
  console.log('profile:', JSON.stringify(profile))
  console.log('email:', email)
  console.log('profile keys:', Object.keys(profile))

  if (!email.endsWith('@impar.pt')) {
    return c.json({ error: 'Acesso restrito a contas @impar.pt' }, 403)
  }

  const sql = neon(c.env.DATABASE_URL)
  await sql`
    INSERT INTO utilizadores (id, nome, email, email_verificado, role)
    VALUES (
      ${profile.id},
      ${profile.displayName},
      ${email},
      true,
      'gestor'
    )
    ON CONFLICT (email) DO UPDATE SET
      nome = EXCLUDED.nome,
      ultimo_login = NOW()
  `

  const token = generateSessionToken()
  const expira = new Date(Date.now() + 8 * 60 * 60 * 1000)

  await sql`
    INSERT INTO sessoes (id, utilizador_id, token, expira_em)
    VALUES (
      ${generateSessionToken()},
      ${profile.id},
      ${token},
      ${expira.toISOString()}
    )
  `

return new Response(null, {
  status: 302,
  headers: {
    'Location': `http://localhost:5173/backoffice?token=${token}`,
    'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=28800; Path=/`
  }
})
})
// ── Middleware de autenticação ────────────────────────────────

async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return c.json({ error: 'Não autorizado' }, 401)

  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT u.id, u.nome, u.email, u.role, u.loja_id
    FROM sessoes s
    JOIN utilizadores u ON u.id = s.utilizador_id
    WHERE s.token = ${token}
      AND s.expira_em > NOW()
  `

  if (rows.length === 0) return c.json({ error: 'Sessão inválida ou expirada' }, 401)

  c.set('user', rows[0])
  await next()
}
// ── Logout ───────────────────────────────────────────────────

app.post('/auth/logout', requireAuth, async (c) => {
  const cookieHeader = c.req.header('Cookie') || ''
  const token = cookieHeader.split(';')
    .map(s => s.trim())
    .find(s => s.startsWith('session='))
    ?.split('=')[1]

  const sql = neon(c.env.DATABASE_URL)
  await sql`DELETE FROM sessoes WHERE token = ${token}`

  return new Response(null, {
    status: 302,
    headers: {
      'Location': 'https://impar.pages.dev/login',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
    }
  })
})

// ── /me — utilizador actual ───────────────────────────────────

app.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') })
})

// Lista de ocorrências com filtros
app.get('/ocorrencias', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { condominio, categoria, status, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT 
      o.id,
      o.condominio_id,
      c.nome as condominio_nome,
      o.categoria_texto,
      cat.nome as categoria_nome,
      cat.emoji as categoria_emoji,
      o.descricao_final,
      o.nome_reportante,
      o.telefone_reportante,
      o.email_reportante,
      o.status,
      o.tem_foto,
      o.foto_url,
      o.latitude,
      o.longitude,
      o.maps_link,
      o.criado_em
    FROM ocorrencias o
    LEFT JOIN condominios c ON c.id = o.condominio_id
    LEFT JOIN categorias cat ON cat.id = o.categoria_id
    WHERE 1=1
      ${condominio ? sql`AND o.condominio_id = ${condominio}` : sql``}
      ${categoria ? sql`AND (cat.nome = ${categoria} OR o.categoria_texto = ${categoria})` : sql``}
      ${status ? sql`AND o.status = ${status}` : sql``}
      ${data_inicio ? sql`AND o.criado_em >= ${data_inicio}` : sql``}
      ${data_fim ? sql`AND o.criado_em <= ${data_fim}` : sql``}
    ORDER BY o.criado_em DESC
    LIMIT 100
  `

  return c.json({ ocorrencias: rows })
})

app.get('/limpezas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { n_impar, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT
      l.id,
      l.condominio_id,
      c.n_impar,
      c.nome as condominio_nome,
      l.latitude,
      l.longitude,
      l.precisao_m,
      l.maps_link,
      l.tem_foto,
      l.foto_url,
      l.ts_checkin
    FROM limpezas l
    LEFT JOIN condominios c ON c.id = l.condominio_id
    WHERE 1=1
      ${n_impar ? sql`AND c.n_impar = ${n_impar}` : sql``}
      ${data_inicio ? sql`AND l.ts_checkin >= ${data_inicio}` : sql``}
      ${data_fim ? sql`AND l.ts_checkin <= ${data_fim}` : sql``}
    ORDER BY l.ts_checkin DESC
    LIMIT 100
  `

  return c.json({ limpezas: rows })
})

export default app