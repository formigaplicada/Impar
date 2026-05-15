import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'

const app = new Hono()

// ── Utilitários ──────────────────────────────────────────────

function generateSessionToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── CORS ─────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
  const allowed = ['http://localhost:5173', 'https://impar.pages.dev']
  if (allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  if (c.req.method === 'OPTIONS') return c.text('', 204)
  await next()
})

// ── Auth ─────────────────────────────────────────────────────

app.get('/auth/login', (c) => {
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

app.get('/auth/callback', async (c) => {
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
  await sql`
    INSERT INTO utilizadores (id, nome, email, email_verificado, role)
    VALUES (${profile.id}, ${profile.displayName}, ${email}, true, 'gestor')
    ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, ultimo_login = NOW()
  `

  const token = generateSessionToken()
  const expira = new Date(Date.now() + 8 * 60 * 60 * 1000)
  await sql`
    INSERT INTO sessoes (id, utilizador_id, token, expira_em)
    VALUES (${generateSessionToken()}, ${profile.id}, ${token}, ${expira.toISOString()})
  `

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `http://localhost:5173/backoffice?token=${token}`,
      'Set-Cookie': `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=28800; Path=/`
    }
  })
})

app.post('/auth/logout', requireAuth, async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    const sql = neon(c.env.DATABASE_URL)
    await sql`DELETE FROM sessoes WHERE token = ${token}`
  }
  return c.json({ ok: true })
})

// ── Middleware ────────────────────────────────────────────────

async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return c.json({ error: 'Não autorizado' }, 401)

  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT u.id, u.nome, u.email, u.role, u.loja_id
    FROM sessoes s
    JOIN utilizadores u ON u.id = s.utilizador_id
    WHERE s.token = ${token} AND s.expira_em > NOW()
  `
  if (rows.length === 0) return c.json({ error: 'Sessão inválida ou expirada' }, 401)
  c.set('user', rows[0])
  await next()
}

// ── Health ────────────────────────────────────────────────────

app.get('/health', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const result = await sql`SELECT COUNT(*) as total FROM lojas`
  return c.json({ ok: true, lojas: Number(result[0].total) })
})

// ── /me ───────────────────────────────────────────────────────

app.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('user') })
})

// ── Lojas ─────────────────────────────────────────────────────

app.get('/lojas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT id, codigo, nome, gestor, email, telefone, morada, proximo_n_impar
    FROM lojas
    WHERE ativo = true
    ORDER BY nome ASC
  `
  return c.json({ lojas: rows })
})

// ── Condomínios ───────────────────────────────────────────────

app.get('/condominios', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { n_impar, nome } = c.req.query()

  const rows = await sql`
    SELECT
      c.id, c.n_impar, c.nome, c.nipc, c.morada, c.codigo_postal,
      c.telefone, c.telemovel, c.n_fracoes, c.iban,
      c.gestor, c.email_gestor, c.telefone2, c.ativo,
      l.id as loja_id, l.nome as loja_nome
    FROM condominios c
    LEFT JOIN lojas l ON l.id = c.loja_id
    WHERE c.ativo = true
      ${n_impar ? sql`AND c.n_impar = ${n_impar}` : sql``}
      ${nome ? sql`AND c.nome ILIKE ${'%' + nome + '%'}` : sql``}
    ORDER BY c.n_impar ASC
    LIMIT 100
  `
  return c.json({ condominios: rows })
})

app.post('/condominios', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { loja_id, nome, nipc, morada, codigo_postal, telefone, telemovel, n_fracoes, iban, gestor, email_gestor, telefone2 } = body

  if (!loja_id || !nome) {
    return c.json({ error: 'Loja e Nome são obrigatórios' }, 400)
  }

  // Obter e incrementar proximo_n_impar da loja atomicamente
  const lojaRes = await sql`
    UPDATE lojas SET proximo_n_impar = proximo_n_impar + 1
    WHERE id = ${loja_id}
    RETURNING proximo_n_impar - 1 as n_impar, nome as loja_nome
  `
  if (lojaRes.length === 0) return c.json({ error: 'Loja não encontrada' }, 404)

  const n_impar = String(lojaRes[0].n_impar)
  const cond_id = String(lojaRes[0].n_impar).padStart(6, '0')

  await sql`
    INSERT INTO condominios (id, n_impar, loja_id, nome, nipc, morada, codigo_postal, telefone, telemovel, n_fracoes, iban, gestor, email_gestor, telefone2)
    VALUES (
      ${cond_id}, ${n_impar}, ${loja_id}, ${nome},
      ${nipc || null}, ${morada || null}, ${codigo_postal || null},
      ${telefone || null}, ${telemovel || null},
      ${n_fracoes ? parseInt(n_fracoes) : null},
      ${iban || null}, ${gestor || null}, ${email_gestor || null}, ${telefone2 || null}
    )
  `

  return c.json({ ok: true, id: cond_id, n_impar })
})

// ── Ocorrências ───────────────────────────────────────────────

app.get('/ocorrencias', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { n_impar, categoria, status, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT
      o.id, o.condominio_id, c.n_impar, c.nome as condominio_nome,
      o.categoria_texto, cat.nome as categoria_nome, cat.emoji as categoria_emoji,
      o.descricao_final, o.nome_reportante, o.telefone_reportante, o.email_reportante,
      o.status, o.tem_foto, o.foto_url, o.latitude, o.longitude, o.maps_link, o.criado_em
    FROM ocorrencias o
    LEFT JOIN condominios c ON c.id = o.condominio_id
    LEFT JOIN categorias cat ON cat.id = o.categoria_id
    WHERE 1=1
      ${n_impar ? sql`AND c.n_impar = ${n_impar}` : sql``}
      ${categoria ? sql`AND (cat.nome = ${categoria} OR o.categoria_texto = ${categoria})` : sql``}
      ${status ? sql`AND o.status = ${status}` : sql``}
      ${data_inicio ? sql`AND o.criado_em >= ${data_inicio}` : sql``}
      ${data_fim ? sql`AND o.criado_em <= ${data_fim}` : sql``}
    ORDER BY o.criado_em DESC
    LIMIT 100
  `
  return c.json({ ocorrencias: rows })
})

// ── Limpezas ──────────────────────────────────────────────────

app.get('/limpezas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { n_impar, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT
      l.id, l.condominio_id, c.n_impar, c.nome as condominio_nome,
      l.latitude, l.longitude, l.precisao_m, l.maps_link,
      l.tem_foto, l.foto_url, l.ts_checkin
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