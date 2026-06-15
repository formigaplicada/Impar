import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { neon } from '@neondatabase/serverless'
import aiRouter from './ai.js';
import condominos from './condominos'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const app = new Hono()

app.route('/condominos', condominos)

app.use('*', cors({
  origin: ['https://app.condexpress.com', 'https://my.condexpress.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.route('/ai', aiRouter);

// ── Utilitários ──────────────────────────────────────────────

function generateSessionToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getMicrosoftToken(env) {
  const res = await fetch(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials'
      })
    }
  )
  const data = await res.json()
  return data.access_token
}

// ── CORS ─────────────────────────────────────────────────────

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
const allowed = [
  'http://localhost:5173',
  'https://condexpress.pages.dev',
  'https://app.condexpress.com',
  'https://my.condexpress.com', 
  'https://impar.formigaplicada.work',
  'https://jovial-otter-0ad2b9.netlify.app'
]
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

// Verifica se utilizador existe
const existente = await sql`
  SELECT id, role FROM utilizadores WHERE email = ${email}
`

if (existente.length > 0) {
  // Utilizador existe — actualiza último login
  await sql`
    UPDATE utilizadores SET ultimo_login = NOW(), nome = ${profile.displayName}
    WHERE email = ${email}
  `
} else {
  // Não existe — cria com gestor_condominio
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
    SELECT u.id, u.nome, u.email, u.role, u.loja_id, s.impersonator_id
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

app.get('/me', requireAuth, async (c) => {
  const user = c.get('user')
  const sql = neon(c.env.DATABASE_URL)

  let impersonator = null
  if (user.impersonator_id) {
    const rows = await sql`SELECT nome FROM utilizadores WHERE id = ${user.impersonator_id}`
    impersonator = rows[0]?.nome || null
  }

  return c.json({ user: { ...user, impersonator_nome: impersonator } })
})


// ── Condomínios ───────────────────────────────────────────────

app.get('/condominios', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')
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
      ${user.role !== 'admin' && user.loja_id ? sql`AND c.loja_id = ${user.loja_id}` : sql``}
      ${n_impar ? sql`AND c.n_impar = ${parseInt(n_impar)}` : sql``}
      ${nome ? sql`AND c.nome ILIKE ${'%' + nome + '%'}` : sql``}
    ORDER BY c.n_impar ASC
    LIMIT 100
  `
  return c.json({ condominios: rows })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /condominios/:id/documentos
//
// Devolve lista de ficheiros/pastas do OneDrive para um condomínio.
// Suporta navegação via query param ?folder_id=xxx
//
// Adicionar ao index.js junto dos outros routes de /condominios
// ─────────────────────────────────────────────────────────────────────────────

app.get('/condominios/:id/documentos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')
  const { folder_id } = c.req.query()

  // Buscar onedrive_folder_id do condomínio
  const cond = await sql`
    SELECT id, n_impar, nome, onedrive_folder_id
    FROM condominios
    WHERE id = ${id}
  `
  if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

  const onedrive_folder_id = cond[0].onedrive_folder_id
  if (!onedrive_folder_id) return c.json({ available: false, items: [] })

  // Se vier folder_id na query, navega para essa subpasta
  // Caso contrário usa a pasta raiz do condomínio
  const targetFolderId = folder_id || onedrive_folder_id

  try {
    const token = await getMicrosoftToken(c.env)

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${targetFolderId}/children?$orderby=name asc&$select=id,name,size,lastModifiedDateTime,webUrl,folder,file`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return c.json({ available: false, error: err?.error?.message || 'Erro Graph API' }, 502)
    }

    const data = await res.json()

    const items = (data.value || []).map(item => ({
      id:       item.id,
      name:     item.name,
      type:     item.folder ? 'folder' : 'file',
      size:     item.size || 0,
      modified: item.lastModifiedDateTime,
      webUrl:   item.webUrl,
      mimeType: item.file?.mimeType || null,
      children: item.folder?.childCount || 0,
    }))

    // Separar pastas e ficheiros, pastas primeiro
    const folders = items.filter(i => i.type === 'folder')
    const files   = items.filter(i => i.type === 'file')

    return c.json({
      available: true,
      folder_id: targetFolderId,
      root_folder_id: onedrive_folder_id,
      items: [...folders, ...files]
    })

  } catch (err) {
    return c.json({ available: false, error: err.message }, 500)
  }
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

  const n_impar = lojaRes[0].n_impar
  const cond_id = String(n_impar).padStart(6, '0')
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
  const user = c.get('user')
  const { n_impar, categoria, status, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT
      o.id, o.condominio_id, c.n_impar, c.nome as condominio_nome,
      o.categoria_texto, cat.nome as categoria_nome, cat.emoji as categoria_emoji,
      o.descricao_final, o.nome_reportante, o.telefone_reportante, o.email_reportante,
      o.status, o.tem_foto, o.foto_url, o.latitude, o.longitude, o.maps_link, o.criado_em
    FROM ocorrencias o
    LEFT JOIN condominios c ON c.n_impar = o.condominio_id
    LEFT JOIN categorias cat ON cat.id = o.categoria_id
    WHERE 1=1
      ${user.role !== 'admin' && user.loja_id ? sql`AND c.loja_id = ${user.loja_id}` : sql``}
      ${n_impar ? sql`AND c.n_impar = ${parseInt(n_impar)}` : sql``}
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
  const user = c.get('user')
  const { n_impar, data_inicio, data_fim } = c.req.query()

  const rows = await sql`
    SELECT
      l.id, l.condominio_id, c.n_impar, c.nome as condominio_nome,
      l.latitude, l.longitude, l.precisao_m, l.maps_link,
      l.tem_foto, l.foto_url, l.ts_checkin
    FROM limpezas l
    LEFT JOIN condominios c ON c.n_impar = l.condominio_id
    WHERE 1=1
      ${user.role !== 'admin' && user.loja_id ? sql`AND c.loja_id = ${user.loja_id}` : sql``}
      ${n_impar ? sql`AND c.n_impar = ${parseInt(n_impar)}` : sql``}
      ${data_inicio ? sql`AND l.ts_checkin >= ${data_inicio}` : sql``}
      ${data_fim ? sql`AND l.ts_checkin <= ${data_fim}` : sql``}
    ORDER BY l.ts_checkin DESC
    LIMIT 100
  `
  return c.json({ limpezas: rows })
})

// ── Workflow de ocorrências ───────────────────────────────────

app.get('/ocorrencias/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')

  const rows = await sql`
    SELECT
      o.id, o.condominio_id, c.n_impar, c.nome as condominio_nome,
      o.categoria_texto, cat.nome as categoria_nome, cat.emoji as categoria_emoji,
      o.descricao_final, o.nome_reportante, o.telefone_reportante, o.email_reportante,
      o.status, o.tem_foto, o.foto_url, o.latitude, o.longitude, o.maps_link,
      o.criado_em, o.atualizado_em
    FROM ocorrencias o
    LEFT JOIN condominios c ON c.n_impar = o.condominio_id
    LEFT JOIN categorias cat ON cat.id = o.categoria_id
    WHERE o.id = ${id}
  `
  if (rows.length === 0) return c.json({ error: 'Ocorrência não encontrada' }, 404)

  const estados = await sql`
    SELECT e.id, e.estado_anterior, e.estado_novo, e.notas, e.criado_em,
           u.nome as utilizador_nome
    FROM ocorrencia_estados e
    LEFT JOIN utilizadores u ON u.id = e.utilizador_id
    WHERE e.ocorrencia_id = ${id}
    ORDER BY e.criado_em ASC
  `

  return c.json({ ocorrencia: rows[0], historico: estados })
})

app.put('/ocorrencias/:id/status', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')
  const user = c.get('user')
  const body = await c.req.json()
  const { status, notas } = body

  const estados_validos = ['aberta', 'em_curso', 'resolvida', 'cancelada']
  if (!estados_validos.includes(status)) {
    return c.json({ error: 'Estado inválido' }, 400)
  }

  // Buscar estado actual e email do reportante
  const atual = await sql`
    SELECT status, email_reportante, nome_reportante, id as oc_id
    FROM ocorrencias WHERE id = ${id}
  `
  if (atual.length === 0) return c.json({ error: 'Ocorrência não encontrada' }, 404)

  const estado_anterior = atual[0].status

  // Actualizar estado
  await sql`
    UPDATE ocorrencias SET status = ${status}, atualizado_em = NOW()
    WHERE id = ${id}
  `

  // Registar histórico
  await sql`
    INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, utilizador_id, notas)
    VALUES (${id}, ${estado_anterior}, ${status}, ${user.id}, ${notas || null})
  `

  // Enviar email se tiver email do reportante
  const email = atual[0].email_reportante
  if (email && status ==='resolvida') {
    const STATUS_LABELS = {
      aberta: 'Aberta', em_curso: 'Em curso',
      resolvida: 'Resolvida', cancelada: 'Cancelada'
    }
    await fetch('https://graph.microsoft.com/v1.0/users/propostas@impar.pt/sendMail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getMicrosoftToken(c.env)}`
      },
      body: JSON.stringify({
        message: {
          subject: `Ocorrência ${id} — ${STATUS_LABELS[status]}`,
          body: {
            contentType: 'HTML',
            content: `
              <p>Caro/a ${atual[0].nome_reportante || 'Condómino'},</p>
              <p>A sua ocorrência <strong>${id}</strong> foi actualizada para o estado <strong>${STATUS_LABELS[status]}</strong>.</p>
              ${notas ? `<p><strong>Nota:</strong> ${notas}</p>` : ''}
              <p>Obrigado,<br>Equipa Ímpar</p>
            `
          },
          toRecipients: [{ emailAddress: { address: email } }]
        },
        saveToSentItems: false
      })
    })
  }

  return c.json({ ok: true })
})

// ── Dashboard ─────────────────────────────────────────────────

app.get('/dashboard', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const { data_inicio, data_fim } = c.req.query()

  const inicio = data_inicio || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fim = data_fim || new Date().toISOString()
  const lojaFilter = user.role !== 'admin' && user.loja_id ? user.loja_id : null

  const [por_estado, por_categoria, por_loja, limpezas, tempo_medio, propostas_por_loja, condominios_por_loja, leads_por_loja_origem, leads_por_campanha, propostas_estados_loja, prestadores_resumo] = await Promise.all([
    sql`
      SELECT o.status, COUNT(*) as total
      FROM ocorrencias o
      LEFT JOIN condominios c ON c.n_impar = o.condominio_id
      WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
        ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
      GROUP BY o.status ORDER BY o.status
    `,
    sql`
      SELECT
        COALESCE(cat.nome, o.categoria_texto, 'Sem categoria') as categoria,
        COALESCE(cat.emoji, '📦') as emoji,
        COUNT(*) as total
      FROM ocorrencias o
      LEFT JOIN categorias cat ON cat.id = o.categoria_id
      LEFT JOIN condominios c ON c.n_impar = o.condominio_id
      WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
        ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
      GROUP BY cat.nome, o.categoria_texto, cat.emoji
      ORDER BY total DESC LIMIT 8
    `,
    sql`
      SELECT COALESCE(l.nome, 'Sem loja') as loja, COUNT(*) as total
      FROM ocorrencias o
      LEFT JOIN condominios c ON c.n_impar = o.condominio_id
      LEFT JOIN lojas l ON l.id = c.loja_id
      WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
        ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
      GROUP BY l.nome ORDER BY total DESC
    `,
    sql`
      SELECT COUNT(*) as total
      FROM limpezas l
      LEFT JOIN condominios c ON c.n_impar = l.condominio_id
      WHERE l.ts_checkin >= ${inicio} AND l.ts_checkin <= ${fim}
        ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
    `,
    sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (e.criado_em - o.criado_em)) / 3600)::numeric, 1) as horas
      FROM ocorrencias o
      JOIN ocorrencia_estados e ON e.ocorrencia_id = o.id
      LEFT JOIN condominios c ON c.n_impar = o.condominio_id
      WHERE e.estado_novo = 'resolvida'
        AND o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
        ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
    `,
    sql`
      SELECT COALESCE(l.nome, 'Sem loja') as loja,
             COUNT(*) as count,
             COALESCE(SUM(p.total_sem_iva), 0) as total_sem_iva
      FROM propostas p
      LEFT JOIN lojas l ON l.id = p.loja_id
      WHERE p.data_envio >= ${inicio} AND p.data_envio <= ${fim}
        ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
      GROUP BY l.nome ORDER BY count DESC
    `,
   // condominios_por_loja
    sql`
      SELECT
        COALESCE(l.nome, 'Sem loja') as loja,
        COUNT(*) FILTER (WHERE c.ativo = true) as total,
        COUNT(*) FILTER (WHERE c.ativo = true AND c.criado_em >= ${inicio} AND c.criado_em <= ${fim}) as novos
      FROM lojas l
      LEFT JOIN condominios c ON c.loja_id = l.id
      WHERE l.ativo = true
        ${lojaFilter ? sql`AND l.id = ${lojaFilter}` : sql``}
      GROUP BY l.nome ORDER BY l.nome ASC
    `,
    // ── QUERY 1 — Leads por loja × origem ────────────────────────────────────────
// Agrupa todas as propostas do período por loja e por origem (utm)
// Usa criado_em (data de entrada do pedido) em vez de data_envio
 
sql`
  SELECT
    COALESCE(l.nome, 'Sem loja') AS loja,
    CASE
      WHEN p.utm_medium = 'cpc'                                        THEN 'ads'
      WHEN p.utm_source = 'google' AND p.utm_medium = 'organic'        THEN 'organico'
      WHEN p.utm_source = '(direct)' OR p.utm_source IS NULL           THEN 'direto'
      ELSE 'outros'
    END AS origem,
    COUNT(*)                                    AS total,
    COALESCE(SUM(p.total_sem_iva), 0)           AS valor
  FROM propostas p
  LEFT JOIN lojas l ON l.id = p.loja_id
  WHERE p.criado_em >= ${inicio} AND p.criado_em <= ${fim}
    ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
  GROUP BY l.nome, origem
  ORDER BY l.nome ASC, origem ASC
`,

// ── QUERY 2 — Leads Google Ads por campanha ───────────────────────────────────
// Só registos com utm_medium = 'cpc'
// Mostra campanha × loja com quantidade e valor
 
sql`
  SELECT
    COALESCE(p.utm_campaign, '(não definido)')  AS campanha,
    COALESCE(l.nome, 'Sem loja')                AS loja,
    COUNT(*)                                    AS total,
    COALESCE(SUM(p.total_sem_iva), 0)           AS valor
  FROM propostas p
  LEFT JOIN lojas l ON l.id = p.loja_id
  WHERE p.utm_medium = 'cpc'
    AND p.criado_em >= ${inicio} AND p.criado_em <= ${fim}
    ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
  GROUP BY p.utm_campaign, l.nome
  ORDER BY total DESC, campanha ASC
`,
sql`
  SELECT
    COALESCE(l.nome, 'Sem loja') AS loja,
    CASE
      WHEN p.estado IN ('duvida', 'pedido_reuniao') THEN 'em_analise'
      ELSE p.estado
    END AS estado_agrupado,
    COUNT(*)                        AS total,
    COALESCE(SUM(p.total_sem_iva), 0) AS valor
  FROM propostas p
  LEFT JOIN lojas l ON l.id = p.loja_id
  WHERE p.estado IN ('enviada', 'recebida', 'duvida', 'pedido_reuniao', 'adjudicada', 'ativa')
    ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
  GROUP BY l.nome, estado_agrupado
  ORDER BY l.nome ASC, estado_agrupado ASC
  `
  ,
    // prestadores_resumo
    sql`
      SELECT
        COUNT(*) FILTER (WHERE ativo = true) as total,
        COUNT(*) FILTER (WHERE ativo = true AND criado_em >= ${inicio} AND criado_em <= ${fim}) as novos
      FROM prestadores
      `
  ])

  return c.json({
    periodo: { inicio, fim },
    por_estado,
    por_categoria,
    por_loja,
    total_limpezas: Number(limpezas[0]?.total || 0),
    tempo_medio_horas: tempo_medio[0]?.horas || null,
    propostas_por_loja,
    condominios_por_loja,
    leads_por_loja_origem,
    leads_por_campanha,
    propostas_estados_loja,
    prestadores_resumo: prestadores_resumo[0] || { total: 0, novos: 0 }
  })
})

// ── Rotas públicas (sem autenticação) ─────────────────────────

// ── Prestadores ───────────────────────────────────────────────

app.get('/prestadores', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { nome, nif, loja_id, servico_id } = c.req.query()

  const rows = await sql`
    SELECT DISTINCT
      p.id, p.nif, p.nome,
      COALESCE(pc.email,    p.email)    AS email,
      COALESCE(pc.telefone, p.telefone) AS telefone,
      COALESCE(
        (SELECT string_agg(DISTINCT s.nome, ', ' ORDER BY s.nome)
         FROM prestador_servicos ps
         JOIN servicos s ON s.id = ps.servico_id
         WHERE ps.prestador_id = p.id),
        '—'
      ) AS servicos
    FROM prestadores p
    LEFT JOIN prestador_contactos pc
      ON pc.prestador_id = p.id
      AND pc.loja_id = ${loja_id ? Number(loja_id) : null}
      AND pc.ativo = true
    ${servico_id || loja_id ? sql`
      JOIN prestador_servicos ps2 ON ps2.prestador_id = p.id
    ` : sql``}
    WHERE p.ativo = true
      ${nome       ? sql`AND p.nome ILIKE ${'%' + nome + '%'}` : sql``}
      ${nif        ? sql`AND p.nif = ${nif}`                   : sql``}
      ${servico_id ? sql`AND ps2.servico_id = ${servico_id}`   : sql``}
      ${loja_id    ? sql`AND ps2.loja_id = ${Number(loja_id)}` : sql``}
    ORDER BY p.nome ASC
    LIMIT 200
  `
  return c.json({ prestadores: rows })
})

app.post('/prestadores', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { nif, nome, natureza, capital, estado, data_inicio, cae, actividade,
          morada, cidade, codigo_postal, regiao, concelho, freguesia,
          email, telefone, website } = body

  if (!nome) return c.json({ error: 'Nome é obrigatório' }, 400)

  const res = await sql`
    INSERT INTO prestadores (nif, nome, natureza, capital, estado, data_inicio, cae, actividade,
      morada, cidade, codigo_postal, regiao, concelho, freguesia, email, telefone, website)
    VALUES (
      ${nif || null}, ${nome}, ${natureza || null}, ${capital || null},
      ${estado || 'active'}, ${data_inicio || null}, ${cae || null}, ${actividade || null},
      ${morada || null}, ${cidade || null}, ${codigo_postal || null}, ${regiao || null},
      ${concelho || null}, ${freguesia || null}, ${email || null}, ${telefone || null},
      ${website || null}
    )
    RETURNING id
  `
  return c.json({ ok: true, id: res[0].id })
})

app.get('/prestadores/:id/contactos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')

  const rows = await sql`
    SELECT pc.id, pc.nome, pc.email, pc.telefone, pc.notas, pc.principal,
           l.nome as loja_nome, pc.condominio_id
    FROM prestador_contactos pc
    LEFT JOIN lojas l ON l.id = pc.loja_id
    WHERE pc.prestador_id = ${id} AND pc.ativo = true
    ORDER BY pc.principal DESC, pc.id ASC
  `
  return c.json({ contactos: rows })
})

app.post('/prestadores/:id/contactos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const prestador_id = c.req.param('id')
  const body = await c.req.json()
  const { nome, email, telefone, loja_id, condominio_id, notas, principal } = body

  const res = await sql`
    INSERT INTO prestador_contactos (prestador_id, nome, email, telefone, loja_id, condominio_id, notas, principal)
    VALUES (
      ${prestador_id}, ${nome || null}, ${email || null}, ${telefone || null},
      ${loja_id || null}, ${condominio_id || null}, ${notas || null}, ${principal || false}
    )
    RETURNING id
  `
  return c.json({ ok: true, id: res[0].id })
})

// ── Atribuição de prestadores a ocorrências ───────────────────

app.post('/ocorrencias/:id/prestador', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const ocorrencia_id = c.req.param('id')
  const user = c.get('user')
  const body = await c.req.json()
  const { prestador_id, contacto_id, notas } = body

  // Gerar token de acesso para o prestador
  const token_acesso = generateSessionToken()
  const token_expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias

  await sql`
    INSERT INTO ocorrencia_prestadores (ocorrencia_id, prestador_id, contacto_id, utilizador_id, notas, token_acesso, token_expira)
    VALUES (${ocorrencia_id}, ${prestador_id}, ${contacto_id || null}, ${user.id}, ${notas || null}, ${token_acesso}, ${token_expira.toISOString()})
  `

  // Mudar estado para em_curso
  const estado_anterior = await sql`SELECT status FROM ocorrencias WHERE id = ${ocorrencia_id}`
  await sql`UPDATE ocorrencias SET status = 'em_curso', atualizado_em = NOW() WHERE id = ${ocorrencia_id}`
  await sql`
    INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, utilizador_id, notas)
    VALUES (${ocorrencia_id}, ${estado_anterior[0].status}, 'em_curso', ${user.id}, ${'Prestador atribuído'})
  `

  // Enviar email ao prestador com link
  const contacto = contacto_id ? await sql`SELECT email, nome FROM prestador_contactos WHERE id = ${contacto_id}` : []
  const prestador = await sql`SELECT email, nome FROM prestadores WHERE id = ${prestador_id}`
  const emailDestino = contacto.length > 0 ? contacto[0].email : prestador[0]?.email

  if (emailDestino) {
    const link = `https://app.condexpress.com/intervencao?token=${token_acesso}`
    await fetch(`https://graph.microsoft.com/v1.0/users/propostas@impar.pt/sendMail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getMicrosoftToken(c.env)}`
      },
      body: JSON.stringify({
        message: {
          subject: `Ocorrência ${ocorrencia_id} — Intervenção necessária`,
          body: {
            contentType: 'HTML',
            content: `
              <p>Caro/a ${contacto.length > 0 ? contacto[0].nome : prestador[0]?.nome},</p>
              <p>Foi-lhe atribuída uma ocorrência que requer a sua intervenção.</p>
              <p><strong>Referência:</strong> ${ocorrencia_id}</p>
              ${notas ? `<p><strong>Notas:</strong> ${notas}</p>` : ''}
              <p>Por favor, após a intervenção, registe-a através do link:</p>
              <p><a href="${link}">${link}</a></p>
              <p>O link é válido por 7 dias.</p>
              <p>Obrigado,<br>Equipa Ímpar</p>
            `
          },
          toRecipients: [{ emailAddress: { address: emailDestino } }]
        },
        saveToSentItems: false
      })
    })
  }

  return c.json({ ok: true, token_acesso })
})

// ── Registo de intervenção (via token — público) ──────────────

app.get('/intervencao/:token', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  const rows = await sql`
    SELECT op.id, op.ocorrencia_id, op.prestador_id, op.token_expira,
           o.condominio_id, c.nome as condominio_nome, c.morada,
           p.nome as prestador_nome
    FROM ocorrencia_prestadores op
    JOIN ocorrencias o ON o.id = op.ocorrencia_id
    JOIN condominios c ON c.n_impar = o.condominio_id
    JOIN prestadores p ON p.id = op.prestador_id
    WHERE op.token_acesso = ${token}
      AND op.token_expira > NOW()
  `

  if (rows.length === 0) return c.json({ error: 'Link inválido ou expirado' }, 404)
  return c.json({ atribuicao: rows[0] })
})

app.post('/intervencao/:token', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')
  const formData = await c.req.formData()

  const atribuicao = await sql`
    SELECT op.id, op.ocorrencia_id, op.prestador_id
    FROM ocorrencia_prestadores op
    WHERE op.token_acesso = ${token} AND op.token_expira > NOW()
  `
  if (atribuicao.length === 0) return c.json({ error: 'Link inválido ou expirado' }, 404)

  const { ocorrencia_id, prestador_id, id: atribuicao_id } = atribuicao[0]

  const latitude  = formData.get('latitude') || null
  const longitude = formData.get('longitude') || null
  const notas     = formData.get('notas') || null
  const temFoto   = formData.get('temFoto') === 'true'

  await sql`
    INSERT INTO intervencoes (ocorrencia_id, prestador_id, atribuicao_id, latitude, longitude, tem_foto, notas, registado_por)
    VALUES (
      ${ocorrencia_id}, ${prestador_id}, ${atribuicao_id},
      ${latitude ? parseFloat(latitude) : null},
      ${longitude ? parseFloat(longitude) : null},
      ${temFoto}, ${notas}, 'prestador'
    )
  `

  // Mudar estado para resolvida
  await sql`UPDATE ocorrencias SET status = 'resolvida', atualizado_em = NOW() WHERE id = ${ocorrencia_id}`
  await sql`
    INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, notas)
    VALUES (${ocorrencia_id}, 'em_curso', 'resolvida', 'Intervenção registada pelo prestador')
  `

  // Enviar email ao condómino
  const oc = await sql`SELECT email_reportante, nome_reportante, id FROM ocorrencias WHERE id = ${ocorrencia_id}`
  if (oc[0]?.email_reportante) {
    await fetch(`https://graph.microsoft.com/v1.0/users/propostas@impar.pt/sendMail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getMicrosoftToken(c.env)}`
      },
      body: JSON.stringify({
        message: {
          subject: `Ocorrência ${ocorrencia_id} — Resolvida`,
          body: {
            contentType: 'HTML',
            content: `
              <p>Caro/a ${oc[0].nome_reportante || 'Condómino'},</p>
              <p>A sua ocorrência <strong>${ocorrencia_id}</strong> foi resolvida.</p>
              <p>Obrigado,<br>Equipa Ímpar</p>
            `
          },
          toRecipients: [{ emailAddress: { address: oc[0].email_reportante } }]
        },
        saveToSentItems: false
      })
    })
  }

  return c.json({ ok: true })
})

// ── NIF.PT ───────────────────────────────────────────────────

app.get('/nif/:nif', requireAuth, async (c) => {
  const nif = c.req.param('nif')

  if (!nif || nif.length < 9) {
    return c.json({ error: 'NIF inválido' }, 400)
  }

  try {
    const url = `https://www.nif.pt/?json=1&q=${nif}&key=${c.env.NIF_API_KEY}`
    const res = await fetch(url)
    const json = await res.json()

    if (json.result !== 'success' || !json.records || !json.records[nif]) {
      return c.json({ error: 'NIF não encontrado' }, 404)
    }

    const r = json.records[nif]
    const cp = r.pc4 && r.pc3 ? `${r.pc4}-${r.pc3}` : null
    const cae = Array.isArray(r.cae) ? r.cae.join(', ') : (r.cae || null)

    return c.json({
      ok: true,
      dados: {
        nome:          r.title      || null,
        morada:        r.address    || null,
        cidade:        r.city       || null,
        codigo_postal: cp,
        actividade:    r.activity   || null,
        estado:        r.status     || 'active',
        cae,
        data_inicio:   r.start_date || null,
        natureza:      r.structure  ? (r.structure.nature   || null) : null,
        capital:       r.structure  ? (r.structure.capital  ? `${r.structure.capital} ${r.structure.capital_currency || 'EUR'}` : null) : null,
        email:         r.contacts   ? (r.contacts.email     || null) : null,
        telefone:      r.contacts   ? (r.contacts.phone     || null) : null,
        website:       r.contacts   ? (r.contacts.website   || null) : null,
        regiao:        r.geo        ? (r.geo.region         || null) : null,
        concelho:      r.geo        ? (r.geo.county         || null) : null,
        freguesia:     r.geo        ? (r.geo.parish         || null) : null
      }
    })
  } catch (err) {
    return c.json({ error: 'Erro ao consultar NIF: ' + err.message }, 500)
  }
})

// Sugestões de prestadores para uma ocorrência
app.get('/ocorrencias/:id/prestadores-sugeridos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const ocorrencia_id = c.req.param('id')

  // Obter condominio e loja da ocorrência
  const oc = await sql`
    SELECT o.condominio_id, c.loja_id
    FROM ocorrencias o
    JOIN condominios c ON c.n_impar = o.condominio_id
    WHERE o.id = ${ocorrencia_id}
  `
  if (oc.length === 0) return c.json({ sugestoes: [] })

  const { condominio_id, loja_id } = oc[0]

  // Último prestador usado neste condomínio
  const ultimo = await sql`
    SELECT DISTINCT ON (op.prestador_id)
      p.id, p.nome, p.email, p.telefone,
      op.criado_em,
      'condominio' as origem
    FROM ocorrencia_prestadores op
    JOIN ocorrencias o ON o.id = op.ocorrencia_id
    JOIN prestadores p ON p.id = op.prestador_id
    WHERE o.condominio_id = ${condominio_id}
    ORDER BY op.prestador_id, op.criado_em DESC
    LIMIT 1
  `

  const ultimoId = ultimo.length > 0 ? ultimo[0].id : null

  // Outros prestadores usados nesta loja (excluindo o último do condomínio)
  const outros = await sql`
    SELECT DISTINCT ON (op.prestador_id)
      p.id, p.nome, p.email, p.telefone,
      op.criado_em,
      'loja' as origem
    FROM ocorrencia_prestadores op
    JOIN ocorrencias o ON o.id = op.ocorrencia_id
    JOIN condominios c ON c.n_impar = o.condominio_id
    JOIN prestadores p ON p.id = op.prestador_id
    WHERE c.loja_id = ${loja_id}
      AND op.prestador_id != ${ultimoId || 0}
    ORDER BY op.prestador_id, op.criado_em DESC
    LIMIT 4
  `

  return c.json({ sugestoes: [...ultimo, ...outros] })
})

// ── Utilizadores (listagem para impersonate) ──────────────────

app.get('/utilizadores', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT u.id, u.nome, u.email, u.role, l.nome as loja_nome
    FROM utilizadores u
    LEFT JOIN lojas l ON l.id = u.loja_id
    WHERE u.role != 'admin' AND u.ativo = true
    ORDER BY u.nome ASC
  `
  return c.json({ utilizadores: rows })
})

// ── Impersonate ───────────────────────────────────────────────

app.post('/admin/impersonate/:utilizador_id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const utilizador_id = c.req.param('utilizador_id')

  // Verifica que o utilizador existe e não é admin
  const target = await sql`
    SELECT id, nome, email, role, loja_id FROM utilizadores
    WHERE id = ${utilizador_id} AND role != 'admin' AND ativo = true
  `
  if (target.length === 0) return c.json({ error: 'Utilizador não encontrado' }, 404)

  // Obtém o token actual do admin (para guardar e poder voltar)
  const authHeader = c.req.header('Authorization') || ''
  const adminToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  // Cria sessão de impersonate
  const token = generateSessionToken()
  const expira = new Date(Date.now() + 8 * 60 * 60 * 1000)

  await sql`
    INSERT INTO sessoes (id, utilizador_id, token, expira_em, impersonator_id)
    VALUES (${generateSessionToken()}, ${utilizador_id}, ${token}, ${expira.toISOString()}, ${user.id})
  `

  // Log no audit
  await sql`
    INSERT INTO audit_log (utilizador_id, acao, tabela, registo_id, payload)
    VALUES (${user.id}, 'impersonate.start', 'utilizadores', ${utilizador_id}, ${JSON.stringify({ target_nome: target[0].nome, target_email: target[0].email })})
  `

  return c.json({ ok: true, token, admin_token: adminToken })
})

app.post('/admin/impersonate/stop', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')

  // Verifica se está em impersonate
  const authHeader = c.req.header('Authorization') || ''
  const currentToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  const sessao = await sql`
    SELECT impersonator_id FROM sessoes WHERE token = ${currentToken}
  `
  if (!sessao[0]?.impersonator_id) return c.json({ error: 'Não está em modo impersonate' }, 400)

  const impersonator_id = sessao[0].impersonator_id

  // Log
  await sql`
    INSERT INTO audit_log (utilizador_id, acao, tabela, registo_id)
    VALUES (${impersonator_id}, 'impersonate.stop', 'utilizadores', ${user.id})
  `

  // Apaga sessão de impersonate
  await sql`DELETE FROM sessoes WHERE token = ${currentToken}`

  return c.json({ ok: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /public/propostas/sync
//
// Recebe dados de uma proposta enviada pelo GAS (Google Apps Script) e faz
// upsert na tabela `propostas`. Sem autenticação (público, como /public/ocorrencias).
//
// Adicionar ao ficheiro principal do Worker Hono (index.js / worker.js),
// junto dos outros routes /public/*.
// ─────────────────────────────────────────────────────────────────────────────

app.post('/public/propostas/sync', async (c) => {
  const sql = neon(c.env.DATABASE_URL)

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Payload JSON inválido' }, 400)
  }

  const {
    codigo,
    loja_nome,
    data_proposta,
    nome,
    telefone,
    email,
    localidade,
    morada,
    n_porta,
    codigo_postal,
    n_fracoes,
    limpeza,
    jardinagem,
    comentarios,
    preco_gestao,
    preco_limpeza,
    preco_jardinagem,
    total_sem_iva,
    outros_servicos,
    preco_outros,
    link_gm,
    link_street_view,
    link_pdf,
    data_envio,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    pagina_origem
  } = body

  if (!codigo || !nome) {
    return c.json({ error: 'codigo e nome são obrigatórios' }, 400)
  }

  // Lookup loja_id pelo nome
  let loja_id = null
  if (loja_nome) {
    const lojaRes = await sql`
     SELECT id FROM lojas WHERE LOWER(nome_comercial) = LOWER(${loja_nome}) AND ativo = true LIMIT 1
    `
    loja_id = lojaRes.length > 0 ? lojaRes[0].id : null
  }

  // Upsert — insere se não existe, actualiza se já existe (por codigo)
  await sql`
    INSERT INTO propostas (
      codigo, loja_id, loja_nome,
      data_proposta, nome, telefone, email,
      localidade, morada, n_porta, codigo_postal,
      n_fracoes, limpeza, jardinagem, comentarios,
      preco_gestao, preco_limpeza, preco_jardinagem, total_sem_iva,
      outros_servicos, preco_outros,
      estado,
      link_gm, link_street_view, link_pdf,
      data_envio,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      pagina_origem
    ) VALUES (
      ${codigo}, ${loja_id}, ${loja_nome || null},
      ${data_proposta || null}, ${nome}, ${telefone || null}, ${email || null},
      ${localidade || null}, ${morada || null}, ${n_porta || null}, ${codigo_postal || null},
      ${n_fracoes ? parseInt(n_fracoes) : null},
      ${limpeza || null}, ${jardinagem || null}, ${comentarios || null},
      ${preco_gestao ? parseFloat(preco_gestao) : null},
      ${preco_limpeza ? parseFloat(preco_limpeza) : null},
      ${preco_jardinagem ? parseFloat(preco_jardinagem) : null},
      ${total_sem_iva ? parseFloat(total_sem_iva) : null},
      ${outros_servicos || null},
      ${preco_outros ? parseFloat(preco_outros) : null},
      'enviada',
      ${link_gm || null}, ${link_street_view || null}, ${link_pdf || null},
      ${data_envio || null},
      ${utm_source || null}, ${utm_medium || null}, ${utm_campaign || null},
      ${utm_content || null}, ${utm_term || null},
      ${pagina_origem || null}
    )
    ON CONFLICT (codigo) DO UPDATE SET
      loja_id            = EXCLUDED.loja_id,
      loja_nome          = EXCLUDED.loja_nome,
      link_pdf           = EXCLUDED.link_pdf,
      data_envio         = EXCLUDED.data_envio,
      preco_gestao       = EXCLUDED.preco_gestao,
      preco_limpeza      = EXCLUDED.preco_limpeza,
      preco_jardinagem   = EXCLUDED.preco_jardinagem,
      total_sem_iva      = EXCLUDED.total_sem_iva,
      outros_servicos    = EXCLUDED.outros_servicos,
      preco_outros       = EXCLUDED.preco_outros,
      link_gm            = EXCLUDED.link_gm,
      link_street_view   = EXCLUDED.link_street_view,
      utm_source         = EXCLUDED.utm_source,
      utm_medium         = EXCLUDED.utm_medium,
      utm_campaign       = EXCLUDED.utm_campaign,
      utm_content        = EXCLUDED.utm_content,
      utm_term           = EXCLUDED.utm_term,
      pagina_origem      = EXCLUDED.pagina_origem,
      atualizado_em      = now()
  `

  return c.json({ ok: true, codigo })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /propostas
//
// Listagem de propostas — apenas acessível a admins.
// Suporta filtros: loja_id, estado, search (nome/email/codigo).
// Adicionar ao ficheiro principal do Worker Hono, junto dos outros routes.
// ─────────────────────────────────────────────────────────────────────────────

app.get('/propostas', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const { loja_id, estado, search } = c.req.query()

  const rows = await sql`
    SELECT
      p.id, p.codigo, p.estado,
      p.data_proposta, p.data_envio,
      p.nome, p.email, p.telefone,
      p.localidade, p.morada, p.n_porta, p.codigo_postal,
      p.n_fracoes, p.limpeza, p.jardinagem, p.comentarios,
      p.preco_gestao, p.preco_limpeza, p.preco_jardinagem,
      p.total_sem_iva, p.outros_servicos, p.preco_outros,
      p.link_gm, p.link_street_view, p.link_pdf,
      p.utm_source, p.utm_medium, p.utm_campaign,
      p.utm_content, p.utm_term, p.pagina_origem,
      p.criado_em, p.atualizado_em,
      l.id as loja_id, l.nome as loja_nome
    FROM propostas p
    LEFT JOIN lojas l ON l.id = p.loja_id
    WHERE 1=1
      ${loja_id ? sql`AND p.loja_id = ${parseInt(loja_id)}` : sql``}
      ${estado   ? sql`AND p.estado = ${estado}` : sql``}
      ${search   ? sql`AND (
        p.nome     ILIKE ${'%' + search + '%'} OR
        p.email    ILIKE ${'%' + search + '%'} OR
        p.codigo   ILIKE ${'%' + search + '%'} OR
        p.localidade ILIKE ${'%' + search + '%'}
      )` : sql``}
    ORDER BY p.data_envio DESC NULLS LAST
    LIMIT 200
  `

  return c.json({ propostas: rows })
})

app.put('/propostas/:id/estado', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)
 
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')
  const { estado, notas } = await c.req.json()
 
  const estados_validos = [
    'em_elaboracao', 'enviada', 'recusada', 'cancelada',
    'adjudicada', 'ativa', 'recebida', 'pedido_reuniao', 'duvida'
  ]
  if (!estados_validos.includes(estado)) return c.json({ error: 'Estado inválido' }, 400)
 
  const atual = await sql`SELECT estado FROM propostas WHERE id = ${parseInt(id)}`
  if (atual.length === 0) return c.json({ error: 'Proposta não encontrada' }, 404)
 
  const estado_anterior = atual[0].estado
 
  await sql`
    UPDATE propostas SET estado = ${estado}, atualizado_em = NOW()
    WHERE id = ${parseInt(id)}
  `
 
  await sql`
    INSERT INTO proposta_estados (proposta_id, estado_anterior, estado_novo, notas, utilizador_id, origem)
    VALUES (${parseInt(id)}, ${estado_anterior}, ${estado}, ${notas || null}, ${user.id}, 'backoffice')
  `
 
  return c.json({ ok: true, estado })
})

// ─────────────────────────────────────────────────────────────────────────────
// Adicionar a seguir ao PUT /propostas/:id/estado
// ─────────────────────────────────────────────────────────────────────────────

app.get('/propostas/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))

  const rows = await sql`
    SELECT
      p.id, p.codigo, p.estado,
      p.data_proposta, p.data_envio,
      p.nome, p.email, p.telefone,
      p.localidade, p.morada, p.n_porta, p.codigo_postal,
      p.n_fracoes, p.limpeza, p.jardinagem, p.comentarios,
      p.preco_gestao, p.preco_limpeza, p.preco_jardinagem,
      p.total_sem_iva, p.outros_servicos, p.preco_outros,
      p.link_gm, p.link_street_view, p.link_pdf,
      p.utm_source, p.utm_medium, p.utm_campaign,
      p.utm_content, p.utm_term, p.pagina_origem,
      p.criado_em, p.atualizado_em,
      l.id as loja_id, l.nome as loja_nome
    FROM propostas p
    LEFT JOIN lojas l ON l.id = p.loja_id
    WHERE p.id = ${id}
  `
  if (rows.length === 0) return c.json({ error: 'Proposta não encontrada' }, 404)

  const historico = await sql`
    SELECT
      e.id, e.estado_anterior, e.estado_novo, e.notas, e.origem, e.criado_em,
      u.nome as utilizador_nome
    FROM proposta_estados e
    LEFT JOIN utilizadores u ON u.id = e.utilizador_id
    WHERE e.proposta_id = ${id}
    ORDER BY e.criado_em ASC
  `

  return c.json({ proposta: rows[0], historico })
})

app.post('/public/propostas/:codigo/estado', async (c) => {
  // Verificar API key
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey || apiKey !== c.env.POWER_AUTOMATE_API_KEY) {
    return c.json({ error: 'Não autorizado' }, 401)
  }
 
  const sql = neon(c.env.DATABASE_URL)
  const codigo = c.req.param('codigo')
 
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Payload JSON inválido' }, 400)
  }
 
  const { estado, notas } = body
 
  const estados_validos = [
    'em_elaboracao', 'enviada', 'recusada', 'cancelada',
    'adjudicada', 'ativa', 'recebida', 'pedido_reuniao', 'duvida'
  ]
  if (!estados_validos.includes(estado)) return c.json({ error: 'Estado inválido' }, 400)
 
  const atual = await sql`SELECT id, estado FROM propostas WHERE codigo = ${codigo}`
  if (atual.length === 0) return c.json({ error: 'Proposta não encontrada' }, 404)
 
  const proposta_id    = atual[0].id
  const estado_anterior = atual[0].estado
 
  await sql`
    UPDATE propostas SET estado = ${estado}, atualizado_em = NOW()
    WHERE id = ${proposta_id}
  `
 
  await sql`
    INSERT INTO proposta_estados (proposta_id, estado_anterior, estado_novo, notas, utilizador_id, origem)
    VALUES (${proposta_id}, ${estado_anterior}, ${estado}, ${notas || null}, NULL, 'power_automate')
  `
 
  return c.json({ ok: true, codigo, estado })
})

// ─────────────────────────────────────────────────────────────────────────────
// OneDrive Sync — adicionar ao index.js
//
// Função core + dois endpoints:
//   POST /admin/onedrive/sync              — sincroniza todos sem onedrive_folder_id
//   POST /admin/onedrive/sync/:condominio_id — sincroniza um condomínio específico
// ─────────────────────────────────────────────────────────────────────────────

// ── Função core ───────────────────────────────────────────────────────────────
//
// Recebe:
//   token       — Microsoft Graph Bearer token
//   loja        — { id, nome, onedrive_activos_folder_id }
//   condominio  — { id, n_impar, old_n_impar }
//   pastaCache  — Map<loja_id, DriveItem[]> para evitar chamadas repetidas
//   sql         — instância neon para gravar o resultado
//
// Devolve:
//   { ok: true,  folder_id, folder_name }   — match encontrado e gravado
//   { ok: false, reason: 'not_found' | 'no_activos_folder' | 'api_error', error? }

async function syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql }) {

  // Loja sem pasta de activos configurada
  if (!loja?.onedrive_activos_folder_id) {
    return { ok: false, reason: 'no_activos_folder' }
  }

  // Buscar lista de pastas da loja (com cache)
  let pastas = pastaCache.get(loja.id)
  if (!pastas) {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${loja.onedrive_activos_folder_id}/children?$top=500&$select=id,name,folder`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json()
        return { ok: false, reason: 'api_error', error: err?.error?.message || `HTTP ${res.status}` }
      }
      const data = await res.json()
      // Guardar só as pastas (não ficheiros)
      pastas = (data.value || []).filter(i => i.folder)
      pastaCache.set(loja.id, pastas)
    } catch (err) {
      return { ok: false, reason: 'api_error', error: err.message }
    }
  }

  // Extrair prefixo numérico do nome da pasta
  // Ex: "12510 - Rua Virgílio Ferreira 37" → 12510
  // Ex: "008 - Rua Júlio Dinis 75"         → 8
  function extractPrefix(name) {
    const match = name.match(/^(\d+)\s*-/)
    if (!match) return null
    return Number(match[1])
  }

  const nImpar    = Number(condominio.n_impar)
  const oldNImpar = condominio.old_n_impar != null ? Number(condominio.old_n_impar) : null

  // Primeira passagem — match por n_impar
  let match = pastas.find(p => extractPrefix(p.name) === nImpar)

  // Segunda passagem — match por old_n_impar (só se existir e for válido)
  if (!match && oldNImpar != null && !isNaN(oldNImpar)) {
    match = pastas.find(p => extractPrefix(p.name) === oldNImpar)
  }

  if (!match) {
    return { ok: false, reason: 'not_found' }
  }

  // Gravar na BD
  await sql`
    UPDATE condominios
    SET onedrive_folder_id = ${match.id}
    WHERE id = ${condominio.id}
  `

  return { ok: true, folder_id: match.id, folder_name: match.name }
}

// ── Endpoint em massa ─────────────────────────────────────────────────────────
// POST /admin/onedrive/sync
// Sincroniza todos os condomínios que ainda não têm onedrive_folder_id

app.post('/admin/onedrive/sync', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)

  // Buscar todos os condomínios sem onedrive_folder_id, com dados da loja
  const condominios = await sql`
    SELECT
      c.id, c.n_impar, c.old_n_impar, c.nome,
      l.id           AS loja_id,
      l.nome         AS loja_nome,
      l.onedrive_activos_folder_id
    FROM condominios c
    JOIN lojas l ON l.id = c.loja_id
    WHERE c.onedrive_folder_id IS NULL
      AND c.ativo = true
    ORDER BY l.id, c.n_impar
  `

  if (condominios.length === 0) {
    return c.json({ ok: true, message: 'Nenhum condomínio por sincronizar.', mapeados: 0, nao_encontrados: 0, erros: 0, detalhes: [] })
  }

  const token      = await getMicrosoftToken(c.env)
  const pastaCache = new Map()

  const resultados = {
    mapeados:       0,
    nao_encontrados: 0,
    erros:          0,
    sem_pasta_loja: 0,
    detalhes:       []
  }

  for (const cond of condominios) {
    const loja = {
      id:                        cond.loja_id,
      nome:                      cond.loja_nome,
      onedrive_activos_folder_id: cond.onedrive_activos_folder_id
    }
    const condominio = {
      id:          cond.id,
      n_impar:     cond.n_impar,
      old_n_impar: cond.old_n_impar
    }

    const res = await syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql })

    if (res.ok) {
      resultados.mapeados++
    } else if (res.reason === 'no_activos_folder') {
      resultados.sem_pasta_loja++
    } else if (res.reason === 'not_found') {
      resultados.nao_encontrados++
    } else {
      resultados.erros++
    }

    resultados.detalhes.push({
      n_impar:     cond.n_impar,
      nome:        cond.nome,
      loja:        cond.loja_nome,
      resultado:   res.ok ? 'mapeado' : res.reason,
      folder_name: res.folder_name || null,
      error:       res.error || null,
    })
  }

  return c.json({ ok: true, ...resultados })
})

// ── Endpoint unitário ─────────────────────────────────────────────────────────
// POST /admin/onedrive/sync/:condominio_id
// Sincroniza um condomínio específico (útil para novos condomínios e botão no frontend)
// Funciona mesmo que já tenha onedrive_folder_id (força re-sync)

app.post('/admin/onedrive/sync/:condominio_id', requireAuth, async (c) => {
  const sql          = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('condominio_id')

  const rows = await sql`
    SELECT
      c.id, c.n_impar, c.old_n_impar, c.nome,
      l.id           AS loja_id,
      l.nome         AS loja_nome,
      l.onedrive_activos_folder_id
    FROM condominios c
    JOIN lojas l ON l.id = c.loja_id
    WHERE c.id = ${condominioId}
  `

  if (rows.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

  const cond = rows[0]
  const loja = {
    id:                        cond.loja_id,
    nome:                      cond.loja_nome,
    onedrive_activos_folder_id: cond.onedrive_activos_folder_id
  }
  const condominio = {
    id:          cond.id,
    n_impar:     cond.n_impar,
    old_n_impar: cond.old_n_impar
  }

  const token      = await getMicrosoftToken(c.env)
  const pastaCache = new Map()

  const res = await syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql })

  if (res.ok) {
    return c.json({ ok: true, folder_id: res.folder_id, folder_name: res.folder_name })
  } else {
    return c.json({ ok: false, reason: res.reason, error: res.error || null }, res.reason === 'api_error' ? 502 : 200)
  }
})

app.get('/condominios/:id/financeiro', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const mandatos = await sql`
    SELECT
      m.id, m.adc, m.iban, m.data_assinatura, m.estado,
      b.nome AS banco_nome, b.bic AS banco_bic
    FROM mandatos_dd m
    LEFT JOIN bancos b ON b.id = m.banco_id
    WHERE m.condominio_id = ${id}
    ORDER BY m.estado = 'activo' DESC, m.criado_em DESC
    LIMIT 5
  `

  return c.json({
    mandato:   mandatos.find(m => m.estado === 'activo') || null,
    historico: mandatos,
    cobranças: []
  })
})

// =============================================================================
// MÓDULO DÉBITOS DIRETOS SEPA — CondExpress
// =============================================================================
// Adicionar ao ficheiro principal do Worker Hono.
//
// Endpoints:
//   POST   /dd/lotes                    — criar lote + gerar PAIN.001
//   GET    /dd/lotes                    — listar lotes
//   GET    /dd/lotes/:id                — detalhe de lote
//   PUT    /dd/lotes/:id/estado         — atualizar estado (ex: submetido)
//   GET    /dd/lotes/:id/pain001        — download PAIN.001 XML
//   POST   /dd/lotes/:id/pain002        — importar PAIN.002 (devoluções)
//   GET    /dd/lotes/:id/transacoes     — listar transações do lote
//   GET    /dd/dashboard                — resumo geral
//
// Todos os endpoints requerem role === 'admin'.
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIO: Gerador PAIN.001 XML (ISO 20022 SDD Core — pain.008.003.02)
// ─────────────────────────────────────────────────────────────────────────────

function gerarPain001(creditor, batch, transactions) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const msgId = `IMPAR-${batch.id}-${Date.now()}`
  const totalTxs = transactions.length
  const totalValor = transactions.reduce((s, t) => s + parseFloat(t.valor), 0).toFixed(2)

  // SEPA obriga a PmtInf separado por sequência (FRST e RCUR não podem misturar)
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
        <PmtId>
          <EndToEndId>${escapeXml(tx.end_to_end_id)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(tx.valor).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(tx.adc)}</MndtId>
            <DtOfSgntr>${tx.data_assinatura}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>
            <Othr><Id>NOTPROVIDED</Id></Othr>
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${escapeXml(tx.condominio_nome)}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id><IBAN>${escapeXml(tx.iban_devedor)}</IBAN></Id>
        </DbtrAcct>
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
    <Cdtr>
      <Nm>${escapeXml(creditor.nome)}</Nm>
    </Cdtr>
    <CdtrAcct>
      <Id><IBAN>${escapeXml(creditor.iban)}</IBAN></Id>
    </CdtrAcct>
    <CdtrAgt>
      <FinInstnId>
        <BIC>${escapeXml(creditor.bic)}</BIC>
      </FinInstnId>
    </CdtrAgt>
    <CdtrSchmeId>
      <Id>
        <PrvtId>
          <Othr>
            <Id>${escapeXml(creditor.creditor_identifier)}</Id>
            <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
          </Othr>
        </PrvtId>
      </Id>
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
      <InitgPty>
        <Nm>${escapeXml(creditor.nome)}</Nm>
      </InitgPty>
    </GrpHdr>
    ${pmtInfBlocks}
  </CstmrDrctDbtInitn>
</Document>`
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIO: Parser PAIN.002 (devoluções)
// ─────────────────────────────────────────────────────────────────────────────

const SEPA_REASON_CODES = {
  AC01: 'IBAN incorreto',
  AC04: 'Conta encerrada',
  AC06: 'Conta bloqueada',
  AG01: 'Débito direto não permitido nesta conta',
  AG02: 'Código de operação inválido',
  AM04: 'Fundos insuficientes',
  AM05: 'Débito duplicado',
  BE05: 'Credor não reconhecido',
  FF01: 'Formato de ficheiro inválido',
  MD01: 'Sem mandato válido',
  MD02: 'Dados do mandato em falta',
  MD06: 'Devolução solicitada pelo devedor',
  MD07: 'Devedor falecido',
  MS02: 'Devolução solicitada pelo cliente',
  MS03: 'Motivo não especificado',
  RC01: 'BIC incorreto',
  RR01: 'Identificação do devedor em falta',
  RR02: 'Nome do devedor em falta',
  RR03: 'Nome do credor em falta',
  RR04: 'Motivo regulatório',
  SL01: 'Serviço específico do banco devedor',
}

function parsePain002(xmlText) {
  const devolvidos = []
  const txBlocks = xmlText.match(/<TxInfAndSts>[\s\S]*?<\/TxInfAndSts>/g) || []

  for (const block of txBlocks) {
    const endToEndId = extrairTag(block, 'OrgnlEndToEndId')
    const reasonCode = extrairTag(block, 'Cd') || extrairTag(block, 'Prtry')
    const dataDevolucao = extrairTag(block, 'AccptncDtTm')?.substring(0, 10)
      || new Date().toISOString().substring(0, 10)

    if (!endToEndId || !reasonCode) continue

    devolvidos.push({
      end_to_end_id: endToEndId,
      reason_code: reasonCode,
      reason_description: SEPA_REASON_CODES[reasonCode] || `Código ${reasonCode}`,
      data_devolucao: dataDevolucao,
      raw_xml: block,
    })
  }

  return devolvidos
}

function extrairTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))
  return match ? match[1].trim() : null
}

function escapeXml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}


// ─────────────────────────────────────────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────────────────────────────────────────

// POST /dd/lotes — criar lote e gerar PAIN.001
app.post('/dd/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const { periodo, data_execucao, condominio_ids } = await c.req.json()

  if (!periodo || !data_execucao) {
    return c.json({ error: 'periodo e data_execucao são obrigatórios' }, 400)
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return c.json({ error: 'periodo deve ter formato YYYY-MM' }, 400)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_execucao)) {
    return c.json({ error: 'data_execucao deve ter formato YYYY-MM-DD' }, 400)
  }

  const sql = neon(c.env.DATABASE_URL)

  // Verificar duplicado
  const loteExistente = await sql`
    SELECT id FROM dd_batches WHERE periodo = ${periodo}
  `
  if (loteExistente.length > 0) {
    return c.json({ error: `Já existe um lote para o período ${periodo}` }, 409)
  }

  // Buscar creditor
  const creditorRows = await sql`SELECT * FROM dd_creditor LIMIT 1`
  if (creditorRows.length === 0) {
    return c.json({ error: 'Creditor não configurado — adicione um registo em dd_creditor' }, 500)
  }
  const creditor = creditorRows[0]

  // Buscar condomínios com mandato ativo
  const condominios = condominio_ids && condominio_ids.length > 0
    ? await sql`
        SELECT
          c.id, c.nome, c.nipc,
          m.id as mandato_id, m.adc, m.data_assinatura, m.iban as iban_devedor
        FROM condominios c
        JOIN mandatos m ON m.condominio_id = c.id
        WHERE c.ativo = true AND m.estado = 'ativo'
          AND c.id = ANY(${condominio_ids})
        ORDER BY c.nome
      `
    : await sql`
        SELECT
          c.id, c.nome, c.nipc,
          m.id as mandato_id, m.adc, m.data_assinatura, m.iban as iban_devedor
        FROM condominios c
        JOIN mandatos m ON m.condominio_id = c.id
        WHERE c.ativo = true AND m.estado = 'ativo'
        ORDER BY c.nome
      `

  if (condominios.length === 0) {
    return c.json({ error: 'Nenhum condomínio com mandato ativo encontrado' }, 400)
  }

  // Determinar FRST vs RCUR — FRST se nunca teve transação 'cobrado'
  const mandatoIds = condominios.map(c => c.mandato_id)
  const mandatosComHistorico = await sql`
    SELECT DISTINCT mandato_id FROM dd_transactions
    WHERE mandato_id = ANY(${mandatoIds}) AND estado = 'cobrado'
  `
  const mandatosRCUR = new Set(mandatosComHistorico.map(r => r.mandato_id))

  // Criar lote
  const referencia = `IMPAR-${periodo}`
  const batchRows = await sql`
    INSERT INTO dd_batches (referencia, periodo, data_execucao, estado)
    VALUES (${referencia}, ${periodo}, ${data_execucao}, 'rascunho')
    RETURNING *
  `
  const batch = batchRows[0]

  // Criar transações
  // NOTA: o valor da quota deve vir da tabela relevante do CondExpress.
  // Neste exemplo usamos c.quota_mensal — ajustar conforme o schema real.
  let totalValor = 0
  const txsParaXml = []

  for (const cond of condominios) {
    const sequencia = mandatosRCUR.has(cond.mandato_id) ? 'RCUR' : 'FRST'
    const endToEndId = `IMPAR-${batch.id}-${cond.id}-${periodo.replace('-', '')}`
    const descricao = `Quota ${periodo} - ${cond.nome}`
    const valor = parseFloat(cond.quota_mensal || 0)

    if (valor <= 0) continue

    await sql`
      INSERT INTO dd_transactions
        (batch_id, condominio_id, mandato_id, sequencia, valor, descricao, end_to_end_id, estado)
      VALUES
        (${batch.id}, ${cond.id}, ${cond.mandato_id}, ${sequencia}, ${valor}, ${descricao}, ${endToEndId}, 'pendente')
    `

    totalValor += valor
    txsParaXml.push({ ...cond, sequencia, end_to_end_id: endToEndId, descricao, valor, condominio_nome: cond.nome })
  }

  // Atualizar totais
  await sql`
    UPDATE dd_batches
    SET total_transacoes = ${txsParaXml.length},
        total_valor = ${totalValor.toFixed(2)},
        atualizado_em = NOW()
    WHERE id = ${batch.id}
  `

  // Gerar e guardar PAIN.001
  const xmlContent = gerarPain001(creditor, batch, txsParaXml)
  await sql`
    UPDATE dd_batches
    SET pain001_xml = ${xmlContent}, estado = 'gerado', atualizado_em = NOW()
    WHERE id = ${batch.id}
  `

  return c.json({
    ok: true,
    batch_id: batch.id,
    referencia,
    total_transacoes: txsParaXml.length,
    total_valor: totalValor.toFixed(2),
  }, 201)
})


// GET /dd/lotes — listar lotes
app.get('/dd/lotes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)

  const rows = await sql`
    SELECT
      b.id, b.referencia, b.periodo, b.data_execucao,
      b.total_transacoes, b.total_valor, b.estado,
      b.criado_em, b.atualizado_em,
      COUNT(r.id) as total_devolucoes,
      COALESCE(SUM(CASE WHEN t.estado = 'cobrado' THEN t.valor END), 0) as valor_cobrado,
      COALESCE(SUM(CASE WHEN t.estado = 'devolvido' THEN t.valor END), 0) as valor_devolvido
    FROM dd_batches b
    LEFT JOIN dd_transactions t ON t.batch_id = b.id
    LEFT JOIN dd_returns r ON r.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.criado_em DESC
    LIMIT 50
  `

  return c.json({ lotes: rows })
})


// GET /dd/lotes/:id — detalhe de lote
app.get('/dd/lotes/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))

  const batchRows = await sql`SELECT * FROM dd_batches WHERE id = ${id}`
  if (batchRows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)

  const transacoes = await sql`
    SELECT
      t.id, t.sequencia, t.valor, t.descricao, t.end_to_end_id, t.estado,
      t.criado_em, t.atualizado_em,
      c.nome as condominio_nome, c.nipc, c.id as condominio_id,
      r.reason_code, r.reason_description, r.data_devolucao
    FROM dd_transactions t
    JOIN condominios c ON c.id = t.condominio_id
    LEFT JOIN dd_returns r ON r.transaction_id = t.id
    WHERE t.batch_id = ${id}
    ORDER BY c.nome
  `

  return c.json({ lote: batchRows[0], transacoes })
})


// PUT /dd/lotes/:id/estado — atualizar estado do lote
app.put('/dd/lotes/:id/estado', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))
  const { estado } = await c.req.json()

  const estados_validos = ['rascunho', 'gerado', 'submetido', 'processado']
  if (!estados_validos.includes(estado)) {
    return c.json({ error: 'Estado inválido' }, 400)
  }

  const rows = await sql`SELECT id FROM dd_batches WHERE id = ${id}`
  if (rows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)

  await sql`
    UPDATE dd_batches SET estado = ${estado}, atualizado_em = NOW() WHERE id = ${id}
  `

  return c.json({ ok: true, estado })
})


// GET /dd/lotes/:id/pain001 — download PAIN.001 XML
app.get('/dd/lotes/:id/pain001', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))

  const rows = await sql`
    SELECT referencia, pain001_xml FROM dd_batches WHERE id = ${id}
  `
  if (rows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)
  if (!rows[0].pain001_xml) return c.json({ error: 'PAIN.001 ainda não gerado' }, 400)

  return new Response(rows[0].pain001_xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="${rows[0].referencia}-PAIN001.xml"`,
    },
  })
})


// POST /dd/lotes/:id/pain002 — importar PAIN.002 (devoluções)
app.post('/dd/lotes/:id/pain002', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))

  const batchRows = await sql`SELECT id FROM dd_batches WHERE id = ${id}`
  if (batchRows.length === 0) return c.json({ error: 'Lote não encontrado' }, 404)

  const { xml } = await c.req.json()
  if (!xml) return c.json({ error: 'xml é obrigatório no body' }, 400)

  const devolvidos = parsePain002(xml)
  if (devolvidos.length === 0) {
    return c.json({ error: 'Nenhuma devolução encontrada no PAIN.002' }, 400)
  }

  let processados = 0
  let naoEncontrados = 0

  for (const dev of devolvidos) {
    const txRows = await sql`
      SELECT t.id, c.nome, c.email_gestor
      FROM dd_transactions t
      JOIN condominios c ON c.id = t.condominio_id
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

    await sql`
      UPDATE dd_transactions SET estado = 'devolvido', atualizado_em = NOW() WHERE id = ${tx.id}
    `

    if (tx.email_gestor) {
      await sql`
        INSERT INTO dd_notifications (transaction_id, batch_id, tipo, destinatario, assunto, estado)
        VALUES (
          ${tx.id}, ${id}, 'devolucao', ${tx.email_gestor},
          ${`Débito devolvido — ${tx.nome} — ${dev.reason_description}`},
          'pendente'
        )
      `
    }

    processados++
  }

  // Transações sem devolução → cobradas
  await sql`
    UPDATE dd_transactions SET estado = 'cobrado', atualizado_em = NOW()
    WHERE batch_id = ${id} AND estado = 'pendente'
  `

  await sql`
    UPDATE dd_batches SET estado = 'processado', atualizado_em = NOW() WHERE id = ${id}
  `

  return c.json({
    ok: true,
    devolvidos: processados,
    nao_encontrados: naoEncontrados,
    total_no_ficheiro: devolvidos.length,
  })
})


// GET /dd/lotes/:id/transacoes — listar transações com filtro opcional de estado
app.get('/dd/lotes/:id/transacoes', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))
  const { estado } = c.req.query()

  const rows = await sql`
    SELECT
      t.id, t.sequencia, t.valor, t.descricao, t.end_to_end_id, t.estado,
      c.nome as condominio_nome, c.nipc, c.iban,
      r.reason_code, r.reason_description, r.data_devolucao
    FROM dd_transactions t
    JOIN condominios c ON c.id = t.condominio_id
    LEFT JOIN dd_returns r ON r.transaction_id = t.id
    WHERE t.batch_id = ${id}
      ${estado ? sql`AND t.estado = ${estado}` : sql``}
    ORDER BY c.nome
  `

  return c.json({ transacoes: rows })
})


// GET /dd/dashboard — resumo geral
app.get('/dd/dashboard', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)

  const [resumo, ultimosLotes, topDevolucoes] = await Promise.all([
    sql`
      SELECT
        COUNT(DISTINCT b.id) as total_lotes,
        COALESCE(SUM(CASE WHEN t.estado = 'cobrado'  THEN t.valor END), 0) as total_cobrado,
        COALESCE(SUM(CASE WHEN t.estado = 'devolvido' THEN t.valor END), 0) as total_devolvido,
        COALESCE(SUM(CASE WHEN t.estado = 'pendente'  THEN t.valor END), 0) as total_pendente,
        COUNT(CASE WHEN t.estado = 'devolvido' THEN 1 END) as num_devolucoes
      FROM dd_batches b
      LEFT JOIN dd_transactions t ON t.batch_id = b.id
    `,
    sql`
      SELECT id, referencia, periodo, data_execucao, total_transacoes, total_valor, estado
      FROM dd_batches ORDER BY criado_em DESC LIMIT 6
    `,
    sql`
      SELECT reason_code, reason_description, COUNT(*) as ocorrencias
      FROM dd_returns
      GROUP BY reason_code, reason_description
      ORDER BY ocorrencias DESC LIMIT 10
    `,
  ])

  return c.json({
    resumo: resumo[0],
    ultimos_lotes: ultimosLotes,
    top_devolucoes: topDevolucoes,
  })
})

// =============================================================================
// MÓDULO WHATSAPP — CondExpress
// =============================================================================
// Adicionar ao ficheiro principal do Worker Hono (index.js).
//
// Endpoints:
//   GET  /whatsapp/webhook   — verificação do challenge pela Meta (público)
//   POST /whatsapp/webhook   — recebe eventos da Meta (público)
//   POST /whatsapp/send      — envia mensagem (requer auth)
//   GET  /whatsapp/comunicacoes — lista comunicacoes WhatsApp (requer auth)
//
// Variáveis de ambiente necessárias no Worker (wrangler.toml / dashboard):
//   WHATSAPP_VERIFY_TOKEN     — token de verificação (defines tu, metes igual na Meta)
//   WHATSAPP_TOKEN            — token permanente da Cloud API da Meta
//   WHATSAPP_PHONE_ID         — Phone Number ID (da Meta)
//   WHATSAPP_INBOX_DRIVE_ID   — b!Ghl6woYj7UubNJ5CYBjF3qNWAIDjiXBGphV4NV5ctJ_S14rrRndLQa5vxcLAXDAr
//   WHATSAPP_INBOX_FOLDER_ID  — 01XKR3VWFNRYRPNAHQNVEJZKTCWCTVPMRO
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

// Descarrega um media do WhatsApp e faz upload para SharePoint (Whatsapp Inbox)
// Devolve { sharepoint_url, nome_ficheiro } ou lança erro
async function downloadWhatsAppMediaToSharePoint(mediaId, mimeType, env) {
  // 1. Obter URL de download do media
  const metaRes = await fetch(
    `https://graph.facebook.com/v25.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }
  )
  if (!metaRes.ok) throw new Error(`Meta media lookup falhou: ${metaRes.status}`)
  const metaData = await metaRes.json()
  const mediaUrl = metaData.url
  if (!mediaUrl) throw new Error('URL de media não encontrado na resposta da Meta')

  // 2. Descarregar o ficheiro binário
  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }
  })
  if (!fileRes.ok) throw new Error(`Download do media falhou: ${fileRes.status}`)
  const fileBuffer = await fileRes.arrayBuffer()

  // 3. Determinar extensão a partir do MIME type
  const extMap = {
    'image/jpeg':       'jpg',
    'image/png':        'png',
    'image/webp':       'webp',
    'video/mp4':        'mp4',
    'audio/ogg':        'ogg',
    'audio/mpeg':       'mp3',
    'application/pdf':  'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  const ext = extMap[mimeType] || 'bin'
  const nomeFicheiro = `${mediaId}_${Date.now()}.${ext}`

  // 4. Upload para SharePoint (pasta Inbox)
  const msToken = await getMicrosoftToken(env)
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${env.WHATSAPP_INBOX_DRIVE_ID}/items/${env.WHATSAPP_INBOX_FOLDER_ID}:/${nomeFicheiro}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${msToken}`,
        'Content-Type': mimeType,
      },
      body: fileBuffer,
    }
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.json()
    throw new Error(`Upload SharePoint falhou: ${err?.error?.message || uploadRes.status}`)
  }
  const uploadData = await uploadRes.json()

  return {
    sharepoint_url: uploadData.webUrl,
    nome_ficheiro:  nomeFicheiro,
  }
}

// Envia uma mensagem de texto via WhatsApp Cloud API
async function enviarMensagemWhatsApp(para, texto, env) {
  const res = await fetch(
    `https://graph.facebook.com/v25.0/${env.WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                para,
        type:              'text',
        text:              { body: texto },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Envio WhatsApp falhou: ${err?.error?.message || res.status}`)
  }
  return await res.json() // contém messages[0].id
}


// ─────────────────────────────────────────────────────────────────────────────
// GET /whatsapp/webhook — verificação do challenge pela Meta
// ─────────────────────────────────────────────────────────────────────────────
// A Meta faz um GET com hub.mode=subscribe, hub.verify_token e hub.challenge.
// Se o verify_token bater certo, respondemos com o challenge (texto simples).

app.get('/whatsapp/webhook', (c) => {
  const mode      = c.req.query('hub.mode')
  const token     = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge, 200)
  }

  return c.json({ error: 'Verificação falhou' }, 403)
})


// ─────────────────────────────────────────────────────────────────────────────
// POST /whatsapp/webhook — recebe eventos da Meta
// ─────────────────────────────────────────────────────────────────────────────
// Processa: mensagens de texto, imagens, documentos, áudio, vídeo
// e updates de estado (entregue, lido).

app.post('/whatsapp/webhook', async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.text('OK', 200) // A Meta espera sempre 200, mesmo em erro
  }

  // A Meta espera sempre 200 rapidamente — processamos de forma assíncrona
  // usando c.executionCtx.waitUntil para não bloquear a resposta
  const processar = async () => {
    try {
      const entry = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      if (!value) return

      // ── Updates de estado (entregue, lido) ───────────────────────────────
      const statuses = value?.statuses || []
      for (const status of statuses) {
        const { id: canal_msg_id, status: estado, timestamp } = status

        const estadoMap = {
          sent:      'enviada',
          delivered: 'entregue',
          read:      'lida',
          failed:    'falhada',
        }
        const novoEstado = estadoMap[estado]
        if (!novoEstado) continue

        await sql`
          UPDATE comunicacoes
          SET
            estado        = ${novoEstado},
            atualizado_em = NOW(),
            entregue_em   = CASE WHEN ${novoEstado} = 'entregue' THEN NOW() ELSE entregue_em END,
            lido_em       = CASE WHEN ${novoEstado} = 'lida'     THEN NOW() ELSE lido_em     END
          WHERE canal_msg_id = ${canal_msg_id}
            AND canal        = 'whatsapp'
        `
      }

      // ── Mensagens recebidas ───────────────────────────────────────────────
      const messages = value?.messages || []
      for (const msg of messages) {
        const canal_msg_id = msg.id
        const de           = msg.from  // número E.164 sem +
        const tipo_raw     = msg.type  // text, image, document, audio, video, location

        // Idempotência — ignorar se já processámos esta mensagem
        const existente = await sql`
          SELECT id FROM comunicacoes
          WHERE canal_msg_id = ${canal_msg_id} AND canal = 'whatsapp'
        `
        if (existente.length > 0) continue

        const tipoMap = {
          text:     'texto',
          image:    'imagem',
          document: 'documento',
          audio:    'audio',
          video:    'video',
          location: 'localizacao',
        }
        const tipo = tipoMap[tipo_raw] || 'texto'

        let conteudo      = null
        let ficheiro_url  = null
        let ficheiro_nome = null
        let ficheiro_mime = null

        if (tipo_raw === 'text') {
          conteudo = msg.text?.body || ''
        }

        if (['image', 'document', 'audio', 'video'].includes(tipo_raw)) {
          const mediaObj = msg[tipo_raw]
          const mediaId  = mediaObj?.id
          ficheiro_mime  = mediaObj?.mime_type || null
          ficheiro_nome  = mediaObj?.filename  || null  // só documentos têm filename

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
            canal, direcao, tipo,
            de, para,
            conteudo, ficheiro_url, ficheiro_nome, ficheiro_mime,
            estado, canal_msg_id,
            criado_em
          ) VALUES (
            'whatsapp', 'inbound', ${tipo},
            ${de}, ${c.env.WHATSAPP_PHONE_ID},
            ${conteudo}, ${ficheiro_url}, ${ficheiro_nome}, ${ficheiro_mime},
            'entregue', ${canal_msg_id},
            NOW()
          )
        `
      }
    } catch (err) {
      console.error('Erro ao processar webhook WhatsApp:', err.message)
    }
  }

  // Responde 200 imediatamente à Meta e processa em background
  c.executionCtx.waitUntil(processar())
  return c.text('OK', 200)
})


// ─────────────────────────────────────────────────────────────────────────────
// POST /whatsapp/send — envia mensagem de texto
// ─────────────────────────────────────────────────────────────────────────────
// Body: { para, texto, contexto_tipo?, contexto_id? }
// para: número E.164 sem + (ex: "351912345678")

app.post('/whatsapp/send', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Payload JSON inválido' }, 400)
  }

  const { para, texto, contexto_tipo, contexto_id } = body

  if (!para || !texto) {
    return c.json({ error: 'para e texto são obrigatórios' }, 400)
  }

  // Normalizar número — remover + se vier com ele
  const numero = para.replace(/^\+/, '')

  let canal_msg_id = null
  let estado = 'enviada'

  try {
    const metaRes = await enviarMensagemWhatsApp(numero, texto, c.env)
    canal_msg_id  = metaRes?.messages?.[0]?.id || null
  } catch (err) {
    estado = 'falhada'
    // Regista na mesma mas com estado falhada
    await sql`
      INSERT INTO comunicacoes (
        canal, direcao, tipo,
        de, para,
        conteudo, estado,
        contexto_tipo, contexto_id,
        utilizador_id
      ) VALUES (
        'whatsapp', 'outbound', 'texto',
        ${c.env.WHATSAPP_PHONE_ID}, ${numero},
        ${texto}, 'falhada',
        ${contexto_tipo || null}, ${contexto_id || null},
        ${user.id}
      )
    `
    return c.json({ error: `Falha ao enviar: ${err.message}` }, 502)
  }

  const rows = await sql`
    INSERT INTO comunicacoes (
      canal, direcao, tipo,
      de, para,
      conteudo, estado, canal_msg_id,
      contexto_tipo, contexto_id,
      utilizador_id
    ) VALUES (
      'whatsapp', 'outbound', 'texto',
      ${c.env.WHATSAPP_PHONE_ID}, ${numero},
      ${texto}, ${estado}, ${canal_msg_id},
      ${contexto_tipo || null}, ${contexto_id || null},
      ${user.id}
    )
    RETURNING id
  `

  return c.json({ ok: true, id: rows[0].id, canal_msg_id })
})


// ─────────────────────────────────────────────────────────────────────────────
// GET /whatsapp/comunicacoes — lista comunicações WhatsApp
// ─────────────────────────────────────────────────────────────────────────────
// Query params opcionais: contexto_tipo, contexto_id, de, limit (default 50)

app.get('/whatsapp/comunicacoes', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { contexto_tipo, contexto_id, de, limit } = c.req.query()
  const maxRows = Math.min(parseInt(limit || '50'), 200)

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
})

// ─────────────────────────────────────────────────────────────────────────────
// AGENDA — Eventos
// Adicionar ao index.js junto dos outros routes
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// AGENDA — Eventos
// ─────────────────────────────────────────────────────────────────────────────


// ── GET /eventos ──────────────────────────────────────────────────────────────

app.get('/eventos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { tipo, gestor, loja_id, mes, estado, condominio_id } = c.req.query()

  let mesInicio = null
  let mesFim    = null
  if (mes) {
    mesInicio = `${mes}-01`
    const [ano, m] = mes.split('-').map(Number)
    const proximo  = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
    mesFim = proximo
  }

  const rows = await sql`
    SELECT
      e.id,
      e.tipo,
      e.tipo_reuniao,
      e.condominio_id,
      e.condominio_texto,
      c.nome        AS condominio_nome,
      c.n_impar     AS condominio_n_impar,
      e.localidade,
      e.loja_id,
      l.nome        AS loja_nome,
      e.filial_texto,
      e.data_hora,
      e.formato,
      e.local_evento,
      e.gestor,
      e.estado,
      e.comentarios,
      e.criado_em,
      e.atualizado_em,
      u.nome        AS criado_por_nome
    FROM eventos e
    LEFT JOIN condominios  c ON c.id = e.condominio_id
    LEFT JOIN lojas        l ON l.id = e.loja_id
    LEFT JOIN utilizadores u ON u.id = e.criado_por
    WHERE 1=1
      ${tipo          ? sql`AND e.tipo         = ${tipo}`                    : sql``}
      ${gestor        ? sql`AND e.gestor        ILIKE ${'%' + gestor + '%'}` : sql``}
      ${loja_id       ? sql`AND e.loja_id       = ${loja_id}`                : sql``}
      ${estado      ? sql`AND e.estado      = ${estado}`               : sql``}
      ${condominio_id ? sql`AND e.condominio_id = ${condominio_id}`          : sql``}
      ${mesInicio     ? sql`AND e.data_hora    >= ${mesInicio}::date`        : sql``}
      ${mesFim        ? sql`AND e.data_hora     < ${mesFim}::date`           : sql``}
    ORDER BY e.data_hora ASC
    LIMIT 500
  `

  return c.json({ eventos: rows })
})


// ── GET /eventos/gestores — lista utilizadores activos para o dropdown ────────

app.get('/eventos/gestores', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT id, nome
    FROM utilizadores
    WHERE ativo = true
    ORDER BY nome ASC
  `
  return c.json({ gestores: rows })
})


// ── GET /eventos/:id ──────────────────────────────────────────────────────────

app.get('/eventos/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const rows = await sql`
    SELECT
      e.*,
      c.nome    AS condominio_nome,
      c.n_impar AS condominio_n_impar,
      l.nome    AS loja_nome
    FROM eventos e
    LEFT JOIN condominios  c ON c.id = e.condominio_id
    LEFT JOIN lojas        l ON l.id = e.loja_id
    WHERE e.id = ${id}
  `
  if (rows.length === 0) return c.json({ error: 'Evento não encontrado' }, 404)
  return c.json({ evento: rows[0] })
})


// ── POST /eventos ─────────────────────────────────────────────────────────────

app.post('/eventos', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const body = await c.req.json()

  const {
    tipo, tipo_reuniao,
    condominio_id, condominio_texto,
    localidade, loja_id, filial_texto,
    data_hora, formato, local_evento,
    gestor, gestor_id,
    estado, comentarios,
  } = body

  if (!data_hora) return c.json({ error: 'data_hora é obrigatória' }, 400)

  const TIPOS         = ['reuniao']
  const TIPOS_REUNIAO = ['ago', 'extraordinaria', 'apresentacao', 'assinaturas', 'outro']
  const FORMATOS      = ['presencial', 'online', 'misto']
  const ESTADOS       = ['agendada', 'realizada', 'adiada', 'cancelada']

  if (tipo         && !TIPOS.includes(tipo))                 return c.json({ error: 'tipo inválido' }, 400)
  if (tipo_reuniao && !TIPOS_REUNIAO.includes(tipo_reuniao)) return c.json({ error: 'tipo_reuniao inválido' }, 400)
  if (formato      && !FORMATOS.includes(formato))           return c.json({ error: 'formato inválido' }, 400)
  if (estado       && !ESTADOS.includes(estado))              return c.json({ error: 'estado inválido' }, 400)

  const rows = await sql`
    INSERT INTO eventos (
      tipo, tipo_reuniao,
      condominio_id, condominio_texto,
      localidade, loja_id, filial_texto,
      data_hora, formato, local_evento,
      gestor, gestor_id,
      estado, comentarios, criado_por
    ) VALUES (
      ${tipo             || 'reuniao'},
      ${tipo_reuniao     || null},
      ${condominio_id    || null},
      ${condominio_texto || null},
      ${localidade       || null},
      ${loja_id          || null},
      ${filial_texto     || null},
      ${data_hora},
      ${formato          || 'presencial'},
      ${local_evento     || null},
      ${gestor           || null},
      ${gestor_id        || null},
      ${estado         || 'agendada'},
      ${comentarios      || null},
      ${user.id}
    )
    RETURNING id
  `

  return c.json({ ok: true, id: rows[0].id }, 201)
})


// ── PUT /eventos/:id ──────────────────────────────────────────────────────────

app.put('/eventos/:id', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const id   = c.req.param('id')
  const body = await c.req.json()

  const existe = await sql`SELECT id FROM eventos WHERE id = ${id}`
  if (existe.length === 0) return c.json({ error: 'Evento não encontrado' }, 404)

  const {
    tipo, tipo_reuniao,
    condominio_id, condominio_texto,
    localidade, loja_id, filial_texto,
    data_hora, formato, local_evento,
    gestor, gestor_id,
    estado, comentarios,
  } = body

  await sql`
    UPDATE eventos SET
      tipo             = ${tipo             || 'reuniao'},
      tipo_reuniao     = ${tipo_reuniao     ?? null},
      condominio_id    = ${condominio_id    ?? null},
      condominio_texto = ${condominio_texto ?? null},
      localidade       = ${localidade       ?? null},
      loja_id          = ${loja_id          ?? null},
      filial_texto     = ${filial_texto     ?? null},
      data_hora        = ${data_hora},
      formato          = ${formato          || 'presencial'},
      local_evento     = ${local_evento     ?? null},
      gestor           = ${gestor          ?? null},
      gestor_id        = ${gestor_id       ?? null},
      estado          = ${estado         || 'agendada'},
      comentarios      = ${comentarios      ?? null}
    WHERE id = ${id}
  `

  return c.json({ ok: true })
})


// ── DELETE /eventos/:id ───────────────────────────────────────────────────────

app.delete('/eventos/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const existe = await sql`SELECT id FROM eventos WHERE id = ${id}`
  if (existe.length === 0) return c.json({ error: 'Evento não encontrado' }, 404)

  await sql`DELETE FROM eventos WHERE id = ${id}`
  return c.json({ ok: true })
})

// ── POST /eventos/sincronizar-estados ─────────────────────────────────────────
app.post('/eventos/sincronizar-estados', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const result = await sql`
    UPDATE eventos
    SET estado = 'realizada'
    WHERE estado = 'agendada'
      AND data_hora < NOW()
  `
  return c.json({ ok: true })
})

// ── POST /eventos/importar ────────────────────────────────────────────────────

app.post('/eventos/importar', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const body = await c.req.json()

  const lista = body?.eventos
  if (!Array.isArray(lista) || lista.length === 0) return c.json({ error: 'Array de eventos em falta ou vazio' }, 400)
  if (lista.length > 1000) return c.json({ error: 'Máximo de 1000 eventos por importação' }, 400)

  let inseridos = 0
  const erros   = []

  for (const e of lista) {
    if (!e.data_hora) { erros.push({ linha: e, motivo: 'data_hora em falta' }); continue }
    try {
      await sql`
        INSERT INTO eventos (
          tipo, tipo_reuniao,
          condominio_texto, localidade, filial_texto,
          data_hora, formato, local_evento,
          gestor, estado, comentarios, criado_por
        ) VALUES (
          ${e.tipo         || 'reuniao'},
          ${e.tipo_reuniao || null},
          ${e.condominio_texto || null},
          ${e.localidade       || null},
          ${e.filial_texto     || null},
          ${e.data_hora},
          ${e.formato      || 'presencial'},
          ${e.local_evento || null},
          ${e.gestor       || null},
          ${e.estado     || 'agendada'},
          ${e.comentarios  || null},
          ${user.id}
        )
      `
      inseridos++
    } catch (err) {
      erros.push({ linha: e, motivo: err.message })
    }
  }

  return c.json({ ok: true, inseridos, erros })
})

// =============================================================================
// CRON — Alertas de Reuniões via WhatsApp
// =============================================================================
// Adicionar ao index.js do Worker.
//
// Endpoint manual para teste:
//   GET /whatsapp/cron/reunioes  (requer auth)
//
// Cron automático configurado no wrangler.toml:
//   "0 17 * * *"  → 17h UTC = 18h Lisboa (horário de inverno)
//   "0 16 * * *"  → 16h UTC = 18h Lisboa (horário de verão)
//
// O Worker não sabe o horário de verão automaticamente — em produção
// podes usar sempre 17h UTC e aceitar a diferença de 1h no verão,
// ou gerir via variável de ambiente.
// =============================================================================


// ─────────────────────────────────────────────────────────────────────────────
// Função principal — busca reuniões de amanhã e envia alertas
// ─────────────────────────────────────────────────────────────────────────────
// =============================================================================
// CRON v2 — Alertas de Reuniões via WhatsApp (template evento_futuro)
// =============================================================================
// Substitui a função enviarAlertasReunioes no index.js
// =============================================================================

async function enviarAlertasReunioes(env) {
  const sql = neon(env.DATABASE_URL)

  const reunioes = await sql`
    SELECT
      e.id,
      e.tipo,
      e.tipo_reuniao,
      e.condominio_texto,
      e.localidade,
      e.local_evento,
      e.data_hora,
      e.formato,
      u.nome      AS utilizador_nome,
      u.telemovel AS utilizador_telemovel
    FROM eventos e
    LEFT JOIN utilizadores u ON u.id = COALESCE(e.gestor_id, e.criado_por)
    WHERE e.tipo = 'reuniao'
      AND e.data_hora >= (NOW() AT TIME ZONE 'Europe/Lisbon' + INTERVAL '1 day')::date
      AND e.data_hora <  (NOW() AT TIME ZONE 'Europe/Lisbon' + INTERVAL '2 days')::date
      AND u.telemovel IS NOT NULL
      AND u.telemovel != ''
      AND u.ativo = true
    ORDER BY e.data_hora ASC
  `

  if (reunioes.length === 0) {
    console.log('Cron reuniões: nenhuma reunião encontrada para amanhã')
    return { enviados: 0, erros: 0, total: 0 }
  }

  console.log(`Cron reuniões: ${reunioes.length} reunião(ões) encontrada(s) para amanhã`)

  let enviados = 0
  let erros = 0

  for (const reuniao of reunioes) {
          const numero = reuniao.utilizador_telemovel
        .replace(/\s/g, '')           // remove espaços
        .replace(/^\+/, '')           // remove + inicial
        .replace(/^00/, '')           // remove 00 inicial
        .replace(/^9/, '3519')        // número PT sem indicativo → adiciona 351
        .replace(/^2/, '3512')        // fixo PT sem indicativo → adiciona 351

    // Formatar parâmetros do template
    const param1_evento  = [reuniao.tipo, reuniao.tipo_reuniao].filter(Boolean).join(' - ')
    const param2_empresa = 'Ímpar'
    const param3_morada  = [reuniao.local_evento, reuniao.localidade].filter(Boolean).join(', ')
    const dataHora       = new Date(reuniao.data_hora)
    const param4_horas   = dataHora.toLocaleString('pt-PT', {
      day:      '2-digit',
      month:    'long',
      hour:     '2-digit',
      minute:   '2-digit',
      timeZone: 'Europe/Lisbon',
    }).replace(',', ' às')

    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${env.WHATSAPP_PHONE_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization:  `Bearer ${env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to:                numero,
            type:              'template',
            template: {
              name:     'evento_futuro',
              language: { code: 'pt_PT' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', parameter_name: 'evento',  text: param1_evento  },
                    { type: 'text', parameter_name: 'empresa', text: param2_empresa },
                    { type: 'text', parameter_name: 'morada',  text: param3_morada  },
                    { type: 'text', parameter_name: 'horas',   text: param4_horas   },
                  ],
                },
              ],
            },
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}`)
      }

      const canal_msg_id = data?.messages?.[0]?.id || null

      await sql`
        INSERT INTO comunicacoes (
          canal, direcao, tipo,
          de, para,
          conteudo, estado, canal_msg_id,
          contexto_tipo, contexto_id
        ) VALUES (
          'whatsapp', 'outbound', 'texto',
          ${env.WHATSAPP_PHONE_ID}, ${numero},
          ${`Alerta reunião: ${param1_evento} em ${param3_morada} — ${param4_horas}`},
          'enviada', ${canal_msg_id},
          'ocorrencia', ${reuniao.id}
        )
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /whatsapp/cron/reunioes — endpoint manual para teste
// ─────────────────────────────────────────────────────────────────────────────
app.get('/whatsapp/cron/reunioes', requireAuth, async (c) => {
  const resultado = await enviarAlertasReunioes(c.env)
  return c.json(resultado)
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /condominios/:id/documentos/pasta
//
// Cria uma nova pasta dentro de uma pasta do OneDrive.
//
// Body JSON: { folder_id: string, name: string }
//   folder_id — ID da pasta pai (se omitido, usa a raiz do condomínio)
//   name      — Nome da nova pasta
//
// Response: { ok: true, item: { id, name, type, modified, webUrl, children } }
// ─────────────────────────────────────────────────────────────────────────────

app.post('/condominios/:id/documentos/pasta', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('id')
  const body = await c.req.json()
  const { folder_id, name } = body

  if (!name || !name.trim()) return c.json({ error: 'Nome da pasta é obrigatório' }, 400)

  // Buscar onedrive_folder_id do condomínio
  const cond = await sql`
    SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}
  `
  if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

  const onedrive_folder_id = cond[0].onedrive_folder_id
  if (!onedrive_folder_id) return c.json({ error: 'Pasta OneDrive não configurada' }, 400)

  const parentId = folder_id || onedrive_folder_id

  try {
    const token = await getMicrosoftToken(c.env)

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${parentId}/children`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return c.json({ ok: false, error: err?.error?.message || 'Erro Graph API' }, 502)
    }

    const item = await res.json()

    return c.json({
      ok: true,
      item: {
        id:       item.id,
        name:     item.name,
        type:     'folder',
        modified: item.lastModifiedDateTime,
        webUrl:   item.webUrl,
        children: 0,
        size:     0,
      },
    })
  } catch (err) {
    return c.json({ ok: false, error: err.message }, 500)
  }
})


// ─────────────────────────────────────────────────────────────────────────────
// POST /condominios/:id/documentos/upload
//
// Faz upload de um ou mais ficheiros para uma pasta do OneDrive.
// Suporta upload de pastas completas via relative_path por ficheiro.
//
// Body: multipart/form-data
//   folder_id      — ID da pasta de destino (se omitido, usa a raiz do condomínio)
//   files          — Um ou mais ficheiros (campo "files")
//   relative_paths — JSON string: array de caminhos relativos paralelo a files
//                    Ex: '["subpasta/doc.pdf", "outro.jpg"]'
//                    Omitir ou enviar array de strings vazias para ficheiros soltos.
//
// Response:
//   { ok: true, items: [...], errors: [...] }
//   Cada item: { name, id, size, modified, webUrl, mimeType }
//   Cada error: { name, error: string }
//
// Notas:
//   — Ficheiros até ~4 MB usam upload simples (PUT .../content).
//   — Ficheiros maiores usam upload session (resumable).
//   — Subpastas são criadas automaticamente se não existirem (via relative_path).
// ─────────────────────────────────────────────────────────────────────────────

app.post('/condominios/:id/documentos/upload', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('id')

  // Buscar onedrive_folder_id do condomínio
  const cond = await sql`
    SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}
  `
  if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

  const onedrive_folder_id = cond[0].onedrive_folder_id
  if (!onedrive_folder_id) return c.json({ error: 'Pasta OneDrive não configurada' }, 400)

  // Parse multipart
  let formData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Erro ao processar form-data' }, 400)
  }

  const folder_id = formData.get('folder_id') || onedrive_folder_id
  const files = formData.getAll('files')

  // relative_paths — array JSON opcional, paralelo a files
  let relativePaths = []
  try {
    const raw = formData.get('relative_paths')
    if (raw) relativePaths = JSON.parse(raw)
  } catch { /* ignora — sem caminhos relativos */ }

  if (!files || files.length === 0) return c.json({ error: 'Nenhum ficheiro enviado' }, 400)

  const token = await getMicrosoftToken(c.env)
  const GRAPH_USER = 'vitor.lopes@impar.pt'
  const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024 // 4 MB

  // Cache de IDs de subpastas já criadas nesta request (evita criar duplicados)
  // Chave: "parentId/nomePasta", Valor: id da pasta criada/encontrada
  const folderCache = {}

  // ── Garante que uma subpasta existe, criando-a se necessário ────────────────
  async function ensureFolder(parentId, folderName) {
    const cacheKey = `${parentId}/${folderName}`
    if (folderCache[cacheKey]) return folderCache[cacheKey]

    // Tenta criar (conflictBehavior: fail para detectar se já existe)
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${parentId}/children`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      folderCache[cacheKey] = data.id
      return data.id
    }

    // Se já existe (409), busca pelo nome
    if (res.status === 409) {
      const listRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${parentId}/children?$filter=name eq '${encodeURIComponent(folderName)}'&$select=id,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const listData = await listRes.json()
      const existing = listData.value?.[0]
      if (existing) {
        folderCache[cacheKey] = existing.id
        return existing.id
      }
    }

    throw new Error(`Não foi possível criar/encontrar a pasta "${folderName}"`)
  }

  // ── Resolve o parentId destino a partir do relative_path ────────────────────
  // Ex: relative_path = "Documentos/2024/Janeiro/ficheiro.pdf"
  //     → cria Documentos → 2024 → Janeiro, devolve id de Janeiro
  async function resolveParent(relativePath) {
    if (!relativePath) return folder_id

    const parts = relativePath.split('/')
    // Remove o último elemento (nome do ficheiro)
    const dirs = parts.slice(0, -1)
    if (dirs.length === 0) return folder_id

    let currentId = folder_id
    for (const dir of dirs) {
      if (!dir) continue
      currentId = await ensureFolder(currentId, dir)
    }
    return currentId
  }

  // ── Upload simples (≤ 4 MB) ──────────────────────────────────────────────────
  async function uploadSimple(parentId, fileName, buffer) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${parentId}:/${encodeURIComponent(fileName)}:/content`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: buffer,
      }
    )
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err?.error?.message || `HTTP ${res.status}`)
    }
    return res.json()
  }

  // ── Upload por sessão (> 4 MB) ───────────────────────────────────────────────
  async function uploadLarge(parentId, fileName, buffer) {
    // 1. Criar sessão
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
      }
    )
    if (!sessionRes.ok) throw new Error('Erro ao criar upload session')
    const { uploadUrl } = await sessionRes.json()

    // 2. Upload em chunks de 10 MB
    const CHUNK = 10 * 1024 * 1024
    const total = buffer.byteLength
    let offset = 0

    let lastItem = null
    while (offset < total) {
      const end = Math.min(offset + CHUNK, total)
      const chunk = buffer.slice(offset, end)
      const chunkRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(end - offset),
          'Content-Range':  `bytes ${offset}-${end - 1}/${total}`,
        },
        body: chunk,
      })
      if (!chunkRes.ok && chunkRes.status !== 202) {
        throw new Error(`Erro no chunk ${offset}-${end - 1}: HTTP ${chunkRes.status}`)
      }
      if (chunkRes.status === 201 || chunkRes.status === 200) {
        lastItem = await chunkRes.json()
      }
      offset = end
    }
    return lastItem
  }

  // ── Processar cada ficheiro ──────────────────────────────────────────────────
  const results = []
  const errors  = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!(file instanceof File)) continue

    const relativePath = relativePaths[i] || ''
    const fileName     = relativePath ? relativePath.split('/').pop() : file.name

    try {
      const parentId = await resolveParent(relativePath)
      const buffer   = await file.arrayBuffer()

      let item
      if (buffer.byteLength <= SIMPLE_UPLOAD_LIMIT) {
        item = await uploadSimple(parentId, fileName, buffer)
      } else {
        item = await uploadLarge(parentId, fileName, buffer)
      }

      results.push({
        name:     item.name,
        id:       item.id,
        size:     item.size || 0,
        modified: item.lastModifiedDateTime,
        webUrl:   item.webUrl,
        mimeType: item.file?.mimeType || null,
      })
    } catch (err) {
      errors.push({ name: fileName, error: err.message })
    }
  }

  return c.json({ ok: true, items: results, errors })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sync OneDrive → Condexpress por Loja
//
// Adicionar ao index.js:
//   1. A função core syncLojaOneDrive (abaixo)
//   2. Os dois endpoints
//   3. A chamada ao cron no scheduled handler (ver fim do ficheiro)
//
// Lógica por pasta do OneDrive da loja:
//   — Pasta cujo onedrive_folder_id já existe na BD  → ignorar
//   — n_impar existe na BD mas sem onedrive_folder_id → ligar (update)
//   — n_impar não existe na BD                        → criar condomínio e ligar
// ─────────────────────────────────────────────────────────────────────────────


// ── Função core ───────────────────────────────────────────────────────────────

async function syncLojaOneDrive({ token, loja, sql }) {
  if (!loja.onedrive_activos_folder_id) {
    return { ok: false, reason: 'no_activos_folder' }
  }

  // 1. Buscar todas as pastas do OneDrive desta loja
  let pastas
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${loja.onedrive_activos_folder_id}/children?$top=500&$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const err = await res.json()
      return { ok: false, reason: 'api_error', error: err?.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    pastas = (data.value || []).filter(i => i.folder)
  } catch (err) {
    return { ok: false, reason: 'api_error', error: err.message }
  }

  if (pastas.length === 0) {
    return { ok: true, criados: 0, ligados: 0, ignorados: 0, detalhes: [] }
  }

  // 2. Buscar IDs de pastas já mapeadas — 1 query
  const jaMapados = await sql`
    SELECT onedrive_folder_id
    FROM condominios
    WHERE onedrive_folder_id IS NOT NULL
      AND ativo = true
  `
  const idsMapados = new Set(jaMapados.map(r => r.onedrive_folder_id))

  // 3. Buscar condomínios existentes com n_impar E old_n_impar — 1 query
      const existentes = await sql`
      SELECT id, n_impar, old_n_impar, onedrive_folder_id
      FROM condominios
      WHERE ativo = true
      `

  // Dois maps para lookup por n_impar e old_n_impar
  const porNImpar    = new Map()
  const porOldNImpar = new Map()
  for (const c of existentes) {
    porNImpar.set(Number(c.n_impar), c)
    if (c.old_n_impar != null) {
      porOldNImpar.set(Number(String(c.old_n_impar).trim()), c)
    }
  }

  function extractPrefix(name) {
    const match = name.match(/^(\d+)\s*-/)
    return match ? Number(match[1]) : null
  }

  function extractNome(name) {
    return name.replace(/^\d+\s*-\s*/, '').trim()
  }

  const detalhes = []
  let ignorados  = 0
  const paraCriar = []
  const paraLigar = []

  for (const pasta of pastas) {
    const nImpar = extractPrefix(pasta.name)

    if (nImpar === null || isNaN(nImpar)) {
      ignorados++
      detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'sem prefixo numérico' })
      continue
    }

    if (idsMapados.has(pasta.id)) {
      ignorados++
      detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'já mapeado' })
      continue
    }

    // Match por n_impar ou old_n_impar
    const existente = porNImpar.get(nImpar) || porOldNImpar.get(nImpar)

    if (existente) {
      if (!existente.onedrive_folder_id) {
        paraLigar.push({ condId: existente.id, folderId: pasta.id, nImpar, pasta: pasta.name })
      } else {
        ignorados++
        detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'já mapeado' })
      }
    } else {
      const nome   = extractNome(pasta.name)
      const condId = String(nImpar)
      paraCriar.push({ condId, nImpar, nome, folderId: pasta.id, pasta: pasta.name })
    }
  }

  // ── Batch INSERT — 1 query ────────────────────────────────────────────────
  let criados = 0
  if (paraCriar.length > 0) {
    try {
      const ids       = paraCriar.map(r => r.condId)
      const nImpars   = paraCriar.map(r => r.nImpar)
      const lojaIds   = paraCriar.map(r => loja.id)
      const nomes     = paraCriar.map(r => r.nome)
      const folderIds = paraCriar.map(r => r.folderId)

      await sql`
        INSERT INTO condominios (id, n_impar, loja_id, nome, onedrive_folder_id)
        SELECT * FROM unnest(
          ${ids}::text[],
          ${nImpars}::int[],
          ${lojaIds}::int[],
          ${nomes}::text[],
          ${folderIds}::text[]
        ) AS t(id, n_impar, loja_id, nome, onedrive_folder_id)
        ON CONFLICT (id) DO NOTHING
      `
      criados = paraCriar.length
      for (const r of paraCriar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'criado', condominio_id: r.condId, nome: r.nome })
      }
    } catch (err) {
      for (const r of paraCriar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'erro', motivo: err.message })
      }
    }
  }

  // ── Batch UPDATE — 1 query ────────────────────────────────────────────────
  let ligados = 0
  if (paraLigar.length > 0) {
    try {
      const condIds   = paraLigar.map(r => r.condId)
      const folderIds = paraLigar.map(r => r.folderId)

      await sql`
        UPDATE condominios
        SET onedrive_folder_id = t.folder_id
        FROM unnest(
          ${condIds}::text[],
          ${folderIds}::text[]
        ) AS t(cond_id, folder_id)
        WHERE condominios.id = t.cond_id
      `
      ligados = paraLigar.length
      for (const r of paraLigar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'ligado', condominio_id: r.condId })
      }
    } catch (err) {
      for (const r of paraLigar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'erro', motivo: err.message })
      }
    }
  }

  return { ok: true, criados, ligados, ignorados, detalhes }
}

// ── GET /lojas — lista todas as lojas (já existia, mas agora inclui onedrive_activos_folder_id) ──
// Se já tens este endpoint, substitui ou ajusta para incluir o campo onedrive_activos_folder_id.

app.get('/lojas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT id, codigo, nome, gestor, email, telefone, morada, proximo_n_impar, onedrive_activos_folder_id
    FROM lojas
    WHERE ativo = true
    ORDER BY nome ASC
  `
  return c.json({ lojas: rows })
})


// ── POST /admin/lojas/:id/sync-onedrive ──────────────────────────────────────
// Sincroniza manualmente uma loja específica (chamado pelo botão no frontend)

app.post('/admin/lojas/:id/sync-onedrive', requireAuth, async (c) => {
  const sql    = neon(c.env.DATABASE_URL)
  const lojaId = c.req.param('id')

  const rows = await sql`
    SELECT id, nome, onedrive_activos_folder_id
    FROM lojas
    WHERE id = ${lojaId} AND ativo = true
  `
  if (rows.length === 0) return c.json({ error: 'Loja não encontrada' }, 404)

  const token = await getMicrosoftToken(c.env)
  const res   = await syncLojaOneDrive({ token, loja: rows[0], sql })

  return c.json(res)
})


// ── POST /admin/lojas/sync-onedrive (todas) ───────────────────────────────────
// Corre o sync em todas as lojas — usado pelo cron e disponível manualmente

app.post('/admin/lojas/sync-onedrive', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const res = await syncTodasAsLojas(c.env, sql)
  return c.json(res)
})


// ── Função usada pelo cron e pelo endpoint em massa ───────────────────────────

async function syncTodasAsLojas(env, sql) {
  const lojas = await sql`
    SELECT id, nome, onedrive_activos_folder_id
    FROM lojas
    WHERE ativo = true
      AND onedrive_activos_folder_id IS NOT NULL
    ORDER BY nome ASC
  `

  if (lojas.length === 0) return { ok: true, lojas: [] }

  const token     = await getMicrosoftToken(env)
  const resultado = []

  for (const loja of lojas) {
    const res = await syncLojaOneDrive({ token, loja, sql })
    resultado.push({ loja_id: loja.id, loja_nome: loja.nome, ...res })
  }

  return { ok: true, lojas: resultado }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /servicos ─────────────────────────────────────────────────────────────
app.get('/servicos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`SELECT * FROM servicos WHERE ativo = true ORDER BY categoria, nome`
  return c.json({ servicos: rows })
})

app.post('/servicos', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const { nome, em_contrato, em_prestador } = await c.req.json()
  if (!nome) return c.json({ error: 'nome é obrigatório' }, 400)
  const rows = await sql`
    INSERT INTO servicos (nome, em_contrato, em_prestador)
    VALUES (${nome}, ${em_contrato || false}, ${em_prestador || false})
    ON CONFLICT (nome) DO UPDATE SET em_prestador = EXCLUDED.em_prestador
    RETURNING id
  `
  return c.json({ ok: true, id: rows[0].id })
})

// ── GET /contratos ────────────────────────────────────────────────────────────
// Filtros: condominio_id, prestador_id, tipo, estado

app.get('/contratos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { condominio_id, prestador_id, tipo, estado } = c.req.query()

  const contratos = await sql`
    SELECT
      c.id, c.tipo, c.estado, c.data_inicio, c.data_fim,
      c.renovacao_automatica, c.documento_url, c.condicoes,
      c.condominio_id, c.prestador_id,
      p.nome AS prestador_nome,
      c.criado_em, c.atualizado_em
    FROM contratos c
    LEFT JOIN prestadores p ON p.id = c.prestador_id
    WHERE 1=1
      ${condominio_id ? sql`AND c.condominio_id = ${condominio_id}` : sql``}
      ${prestador_id  ? sql`AND c.prestador_id  = ${prestador_id}`  : sql``}
      ${tipo          ? sql`AND c.tipo          = ${tipo}`          : sql``}
      ${estado        ? sql`AND c.estado        = ${estado}`        : sql``}
    ORDER BY c.data_inicio DESC
  `

  // Carregar serviços de cada contrato
  if (contratos.length === 0) return c.json({ contratos: [] })

  const ids = contratos.map(c => c.id)
  const servicos = await sql`
    SELECT
      cs.id, cs.contrato_id, cs.servico_id, cs.nome_custom, cs.valor_mensal,
      cs.periodicidade, cs.estimativa, cs.observacoes,
      s.nome AS servico_nome, s.categoria
    FROM contrato_servicos cs
    JOIN servicos s ON s.id = cs.servico_id
    WHERE cs.contrato_id = ANY(${ids})
    ORDER BY s.nome
  `

  const resultado = contratos.map(c => ({
    ...c,
    servicos: servicos.filter(s => s.contrato_id === c.id),
  }))

  return c.json({ contratos: resultado })
})


// ── GET /contratos/:id ────────────────────────────────────────────────────────
app.get('/contratos/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const rows = await sql`
    SELECT c.*, p.nome AS prestador_nome
    FROM contratos c
    LEFT JOIN prestadores p ON p.id = c.prestador_id
    WHERE c.id = ${id}
  `
  if (rows.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)

  const servicos = await sql`
    SELECT cs.*, s.nome AS servico_nome, s.categoria
    FROM contrato_servicos cs
    JOIN servicos s ON s.id = cs.servico_id
    WHERE cs.contrato_id = ${id}
    ORDER BY s.nome
  `

  return c.json({ contrato: { ...rows[0], servicos } })
})


// ── GET /contratos/:id/logs ───────────────────────────────────────────────────
app.get('/contratos/:id/logs', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const logs = await sql`
    SELECT cl.*, u.nome AS utilizador_nome
    FROM contrato_logs cl
    LEFT JOIN utilizadores u ON u.id = cl.utilizador_id
    WHERE cl.contrato_id = ${id}
    ORDER BY cl.criado_em DESC
    LIMIT 100
  `
  return c.json({ logs })
})


// ── POST /contratos ───────────────────────────────────────────────────────────
app.post('/contratos', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const body = await c.req.json()

  const {
    tipo, condominio_id, prestador_id,
    data_inicio, data_fim, estado,
    renovacao_automatica, documento_url, condicoes,
    servicos = [],
  } = body

  if (!data_inicio) return c.json({ error: 'data_inicio é obrigatória' }, 400)
  if (!condominio_id) return c.json({ error: 'condominio_id é obrigatório' }, 400)

  const TIPOS   = ['condominio', 'prestador']
  const ESTADOS = ['ativo', 'suspenso', 'terminado']
  if (tipo   && !TIPOS.includes(tipo))     return c.json({ error: 'tipo inválido' }, 400)
  if (estado && !ESTADOS.includes(estado)) return c.json({ error: 'estado inválido' }, 400)

  const rows = await sql`
    INSERT INTO contratos (
      tipo, condominio_id, prestador_id,
      data_inicio, data_fim, estado,
      renovacao_automatica, documento_url, condicoes, criado_por
    ) VALUES (
      ${tipo               || 'condominio'},
      ${condominio_id},
      ${prestador_id       || null},
      ${data_inicio},
      ${data_fim           || null},
      ${estado             || 'ativo'},
      ${renovacao_automatica || false},
      ${documento_url      || null},
      ${condicoes          || null},
      ${user.id}
    )
    RETURNING id
  `
  const contratoId = rows[0].id

  // Inserir serviços
  for (const s of servicos) {
    if (!s.servico_id) continue
    await sql`
      INSERT INTO contrato_servicos (contrato_id, servico_id, nome_custom, valor_mensal, periodicidade, estimativa, observacoes)
      VALUES (${contratoId}, ${s.servico_id || null}, ${s.nome_custom || null}, ${s.valor_mensal || null}, ${s.periodicidade || 'mensal'}, ${s.estimativa || false}, ${s.observacoes || null})
      ON CONFLICT (contrato_id, servico_id) WHERE servico_id IS NOT NULL DO UPDATE SET
        valor_mensal  = EXCLUDED.valor_mensal,
        periodicidade = EXCLUDED.periodicidade,
        estimativa    = EXCLUDED.estimativa,
        observacoes   = EXCLUDED.observacoes
    `
  }

  // Se for contrato de prestador, upsert em prestador_servicos (incrementar contador)
  if ((tipo || 'condominio') === 'prestador' && prestador_id) {
    const condInfo = await sql`SELECT loja_id FROM condominios WHERE id = ${condominio_id}`
    const lojaId   = condInfo[0]?.loja_id || null
    for (const s of servicos) {
      if (!s.servico_id) continue
      await sql`
        INSERT INTO prestador_servicos (prestador_id, servico_id, loja_id, contador)
        VALUES (${Number(prestador_id)}, ${s.servico_id}, ${lojaId}, 1)
        ON CONFLICT (prestador_id, servico_id, loja_id)
        DO UPDATE SET contador = prestador_servicos.contador + 1, atualizado_em = NOW()
      `
    }
  }

  // Log criação
  await sql`
    INSERT INTO contrato_logs (contrato_id, utilizador_id, acao, detalhe)
    VALUES (${contratoId}, ${user.id}, 'contrato criado', ${JSON.stringify({ tipo, estado: estado || 'ativo' })}::jsonb)
  `

  return c.json({ ok: true, id: contratoId }, 201)
})


// ── PUT /contratos/:id ────────────────────────────────────────────────────────
app.put('/contratos/:id', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const id   = c.req.param('id')
  const body = await c.req.json()

  const antes = await sql`SELECT * FROM contratos WHERE id = ${id}`
  if (antes.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)

  const {
    tipo, prestador_id,
    data_inicio, data_fim, estado,
    renovacao_automatica, documento_url, condicoes,
    servicos = [],
  } = body

  await sql`
    UPDATE contratos SET
      tipo                 = ${tipo                || antes[0].tipo},
      prestador_id         = ${prestador_id        ?? null},
      data_inicio          = ${data_inicio         || antes[0].data_inicio},
      data_fim             = ${data_fim            ?? null},
      estado               = ${estado              || antes[0].estado},
      renovacao_automatica = ${renovacao_automatica ?? antes[0].renovacao_automatica},
      documento_url        = ${documento_url       ?? null},
      condicoes            = ${condicoes           ?? null}
    WHERE id = ${id}
  `

  // Sincronizar serviços — apagar os que foram removidos, upsert os restantes
  const idsNovos = servicos.map(s => s.servico_id).filter(Boolean)

  if (idsNovos.length > 0) {
    await sql`DELETE FROM contrato_servicos WHERE contrato_id = ${id} AND servico_id != ALL(${idsNovos})`
  } else {
    await sql`DELETE FROM contrato_servicos WHERE contrato_id = ${id}`
  }

  for (const s of servicos) {
    if (!s.servico_id) continue
    await sql`
      INSERT INTO contrato_servicos (contrato_id, servico_id, valor_mensal, periodicidade, estimativa, observacoes)
      VALUES (${id}, ${s.servico_id}, ${s.valor_mensal || null}, ${s.periodicidade || 'mensal'}, ${s.estimativa || false}, ${s.observacoes || null})
      ON CONFLICT (contrato_id, servico_id) DO UPDATE SET
        valor_mensal  = EXCLUDED.valor_mensal,
        periodicidade = EXCLUDED.periodicidade,
        estimativa    = EXCLUDED.estimativa,
        observacoes   = EXCLUDED.observacoes
    `
  }

  // Log alterações relevantes
  const logs = []
  if (estado && estado !== antes[0].estado)
    logs.push({ acao: 'estado alterado', detalhe: { antes: antes[0].estado, depois: estado } })
  if (documento_url !== antes[0].documento_url)
    logs.push({ acao: 'documento actualizado', detalhe: {} })
  if (logs.length === 0)
    logs.push({ acao: 'contrato editado', detalhe: {} })

  for (const log of logs) {
    await sql`
      INSERT INTO contrato_logs (contrato_id, utilizador_id, acao, detalhe)
      VALUES (${id}, ${user.id}, ${log.acao}, ${JSON.stringify(log.detalhe)}::jsonb)
    `
  }

  return c.json({ ok: true })
})


// ── DELETE /contratos/:id ─────────────────────────────────────────────────────
app.delete('/contratos/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  const existe = await sql`SELECT id FROM contratos WHERE id = ${id}`
  if (existe.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)

  await sql`DELETE FROM contratos WHERE id = ${id}`
  return c.json({ ok: true })
})


// ── GET /prestadores/por-servico/:servico_id ──────────────────────────────────
// Devolve prestadores associados a um serviço, ordenados por contador DESC
// Filtro opcional: loja_id (para mostrar os da loja primeiro)

app.get('/prestadores/por-servico/:servico_id', requireAuth, async (c) => {
  const sql        = neon(c.env.DATABASE_URL)
  const servico_id = c.req.param('servico_id')
  const { loja_id } = c.req.query()

  // 1 — Prestadores da loja para este serviço
  const associados = await sql`
    SELECT p.id, p.nome, p.telefone, p.email, p.cidade, ps.contador
    FROM prestador_servicos ps
    JOIN prestadores p ON p.id = ps.prestador_id
    WHERE ps.servico_id = ${servico_id}
      AND ps.loja_id = ${Number(loja_id)}
      AND p.ativo = true
    ORDER BY ps.contador DESC, p.nome ASC
  `

  // 2 — Prestadores não associados a este serviço+loja (para associar)
  const naoAssociados = await sql`
  SELECT p.id, p.nome, p.telefone, p.email, p.cidade
  FROM prestadores p
  WHERE p.ativo = true
    AND p.id IN (
      SELECT DISTINCT prestador_id FROM prestador_servicos
      WHERE servico_id = ${servico_id}
    )
    AND p.id NOT IN (
      SELECT prestador_id FROM prestador_servicos
      WHERE servico_id = ${servico_id}
        AND loja_id = ${Number(loja_id)}
    )
  ORDER BY p.nome ASC
`

  return c.json({ associados, nao_associados: naoAssociados })
})

// ── POST /prestador-servicos ──────────────────────────────────────────────────
// Associar manualmente um prestador a um serviço (sem incrementar contador)

app.post('/prestador-servicos', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const { prestador_id, servico_id, loja_id } = await c.req.json()

  if (!prestador_id || !servico_id) return c.json({ error: 'prestador_id e servico_id são obrigatórios' }, 400)

  await sql`
    INSERT INTO prestador_servicos (prestador_id, servico_id, loja_id, contador)
    VALUES (${prestador_id}, ${servico_id}, ${loja_id || null}, 0)
    ON CONFLICT (prestador_id, servico_id, loja_id) DO NOTHING
  `

  return c.json({ ok: true })
})

// ── GET /qr ───────────────────────────────────────────────────
// Recebe ?id=XXXXX (n_impar ou old_n_impar), faz lookup na Neon,
// redireciona para https://app.condexpress.com/?condominio=NIPC
// Sem autenticação — é chamado pelos QR codes públicos

app.get('/qr', async (c) => {
  const id = c.req.query('id')
  if (!id) {
    return c.html(`
      <!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
      <title>Erro</title></head><body>
      <p>QR Code inválido — ID em falta.</p>
      </body></html>
    `, 400)
  }

  const sql = neon(c.env.DATABASE_URL)

  // Tenta n_impar (integer) primeiro; se não for número, tenta old_n_impar (text)
  const idInt = parseInt(id, 10)
  let rows = []

  if (!isNaN(idInt)) {
    rows = await sql`
      SELECT nipc FROM condominios
      WHERE n_impar = ${idInt} AND ativo = true
      LIMIT 1
    `
  }

  if (rows.length === 0) {
    rows = await sql`
      SELECT nipc FROM condominios
      WHERE old_n_impar = ${id} AND ativo = true
      LIMIT 1
    `
  }

  if (rows.length === 0 || !rows[0].nipc) {
    return c.html(`
      <!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
      <title>Não encontrado</title></head><body>
      <p>Condomínio não encontrado. Verifica o QR Code.</p>
      </body></html>
    `, 404)
  }

  const nipc = rows[0].nipc
  const destino = `https://my.condexpress.com/?condominio=${encodeURIComponent(nipc)}`

  return new Response(null, {
    status: 302,
    headers: { 'Location': destino }
  })
})


// ── POST /analyze-image ───────────────────────────────────────
// Proxy para a API Anthropic — análise de foto ou sugestão de categoria
// Sem autenticação — é chamado pelo frontend público (ocorrencia.html)

app.post('/analyze-image', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Body inválido' }, 400)
  }

  let messages

  if (body.prompt) {
    // Modo texto — sugestão de categoria
    messages = [{ role: 'user', content: body.prompt }]
  } else if (body.imageBase64) {
    // Modo imagem — análise de foto
    const base64Data = body.imageBase64.includes(',')
      ? body.imageBase64.split(',')[1]
      : body.imageBase64

    messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
        },
        {
          type: 'text',
          text: 'És um assistente de gestão de condomínios. Analisa esta foto e descreve de forma clara e objetiva a ocorrência ou problema que está visível, em português europeu. Sê conciso (máximo 2 frases). Se não conseguires identificar nenhum problema claro, diz isso de forma simples.'
        }
      ]
    }]
  } else {
    return c.json({ error: 'Parâmetros em falta' }, 400)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages
    })
  })

  const data = await response.json()

  if (!response.ok) {
    return c.json({ error: 'Erro da API Anthropic', detail: data }, 502)
  }

  const descricao = data.content?.[0]?.text || 'Não foi possível analisar.'
  return c.json({ descricao })
})

// ── GET /condominio/info ──────────────────────────────────────
// Recebe ?id=XXXXX (n_impar ou NIPC de 9 dígitos)
// Devolve { nome, nipc, n_impar } — sem autenticação, usado pelo frontend público

app.get('/condominio/info', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ error: 'ID em falta' }, 400)

  const sql = neon(c.env.DATABASE_URL)
  const idStr = String(id).trim()
  const idInt = parseInt(idStr, 10)
  let rows = []

  if (idStr.length === 9 && !isNaN(idInt)) {
    // NIPC — 9 dígitos
    rows = await sql`
      SELECT nome, nipc, n_impar FROM condominios
      WHERE nipc = ${idStr} AND ativo = true
      LIMIT 1
    `
  }

  if (rows.length === 0 && !isNaN(idInt)) {
    // n_impar (integer)
    rows = await sql`
      SELECT nome, nipc, n_impar FROM condominios
      WHERE n_impar = ${idInt} AND ativo = true
      LIMIT 1
    `
  }

  if (rows.length === 0) {
    // old_n_impar (text)
    rows = await sql`
      SELECT nome, nipc, n_impar FROM condominios
      WHERE old_n_impar = ${idStr} AND ativo = true
      LIMIT 1
    `
  }

  if (rows.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

  return c.json({
    nome:    rows[0].nome,
    nipc:    rows[0].nipc,
    n_impar: rows[0].n_impar
  })
})

// ── GET /public/categorias ────────────────────────────────────
// Devolve lista de categorias activas, ordenadas
// Sem autenticação — usado pelo frontend público (ocorrencia.html)

app.get('/public/categorias', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT id, nome, emoji
    FROM categorias
    WHERE ativo = true
    ORDER BY ordem ASC, nome ASC
  `
  return c.json({ categorias: rows })
})


// ── GET /public/validar-pin ───────────────────────────────────
// Valida PIN de utilizador Ímpar
// Sem autenticação — usado pelo frontend público (index.html)

app.get('/public/validar-pin', async (c) => {
  const pin = c.req.query('pin')
  if (!pin) return c.json({ valido: false, user: '' })

  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT nome FROM utilizadores
    WHERE pin = ${pin.trim()} AND ativo = true
    LIMIT 1
  `
  if (rows.length === 0) return c.json({ valido: false, user: '' })
  return c.json({ valido: true, user: rows[0].nome })
})


// ── POST /public/limpezas ─────────────────────────────────────
// Regista check-in de limpeza
// Sem autenticação — chamado pelo limpeza.html e pelo GAS (transitório)

app.post('/public/limpezas', async (c) => {
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

  const sql = neon(c.env.DATABASE_URL)

 const condId = String(d.condominio || '').trim()
const idInt  = parseInt(condId, 10)
let condRows = []

if (condId.length === 9 && /^\d+$/.test(condId)) {
  condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE nipc = ${condId} AND ativo = true LIMIT 1`
}
if (condRows.length === 0 && !isNaN(idInt)) {
  condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE n_impar = ${idInt}::integer AND ativo = true LIMIT 1`
}
if (condRows.length === 0) {
  condRows = await sql`SELECT id, n_impar, loja_id FROM condominios WHERE old_n_impar = ${condId} AND ativo = true LIMIT 1`
}

if (condRows.length === 0) {
  return c.json({ error: 'Condomínio não encontrado: ' + condId }, 404)
}

const condominioId = condRows[0]?.n_impar || null
const lojaId       = condRows[0]?.loja_id  || null

  // Upload foto para SharePoint (se existir)
  let fotoUrl = d.fotoUrl || null
  if (d.photoBase64 && d.photoBase64.length > 100) {
    try {
      fotoUrl = await uploadFotoSharePoint(c.env, d.photoBase64, 'Limpeza', condId, lojaId)
    } catch (err) {
      fotoUrl = null
    }
  }

  const mapsLink  = d.mapsLink || (d.latitude && d.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
    : null)

  const tsCheckin = d.timestamp
    ? new Date(d.timestamp.split(', ').reverse().join('T') + ':00')
    : new Date()

  await sql`
    INSERT INTO limpezas (
      condominio_id, loja_id, latitude, longitude, precisao_m,
      maps_link, tem_foto, foto_url, pin_validado, ts_checkin
    ) VALUES (
      ${condominioId},
      ${lojaId},
      ${parseFloat(d.latitude)  || null},
      ${parseFloat(d.longitude) || null},
      ${parseFloat(d.accuracy)  || null},
      ${mapsLink},
      ${d.temFoto === 'true' || !!fotoUrl},
      ${fotoUrl},
      true,
      NOW()
    )
  `

  // Email via Graph API
  try {
    await enviarEmailLimpeza(c.env, d, lojaId)
  } catch (_) {}

  return c.json({ ok: true })
 } catch (err) {
    return c.json({ error: err.message, stack: err.stack?.split('\n').slice(0,3) }, 500)
  }
})


// ── POST /public/ocorrencias ──────────────────────────────────
// Regista ocorrência
// Sem autenticação — chamado pelo ocorrencia.html e pelo GAS (transitório)

app.post('/public/ocorrencias', async (c) => {
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

  const sql = neon(c.env.DATABASE_URL)

  const condId = String(d.condominio || '').trim()
const idInt  = parseInt(condId, 10)
let condRows = []

if (condId.length === 9 && /^\d+$/.test(condId)) {
  condRows = await sql`SELECT id, n_impar, loja_id, morada FROM condominios WHERE nipc = ${condId} AND ativo = true LIMIT 1`
}
if (condRows.length === 0 && !isNaN(idInt)) {
  condRows = await sql`SELECT id, n_impar, loja_id, morada FROM condominios WHERE n_impar = ${idInt}::integer AND ativo = true LIMIT 1`
}
if (condRows.length === 0) {
  condRows = await sql`SELECT id, n_impar, loja_id, morada  FROM condominios WHERE old_n_impar = ${condId} AND ativo = true LIMIT 1`
}

if (condRows.length === 0) {
  return c.json({ error: 'Condomínio não encontrado: ' + condId }, 404)
}

const condominioId = condRows[0]?.n_impar || null
const lojaId       = condRows[0]?.loja_id  || null
const morada       = condRows[0]?.morada  || null

  // Upload foto para SharePoint
  let fotoUrl = d.fotoUrl || null
  if (d.photoBase64 && d.photoBase64.length > 100) {
    try {
      fotoUrl = await uploadFotoSharePoint(c.env, d.photoBase64, 'Ocorrencia', condId, lojaId)
    } catch (err) {
      fotoUrl = null
    }
  }

  const mapsLink = d.mapsLink || (d.latitude && d.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
    : null)

  // Resolver categoria_id se existir
  let categoriaId = null
  if (d.categoria) {
    const catRows = await sql`
      SELECT id FROM categorias WHERE nome = ${d.categoria} AND ativo = true LIMIT 1
    `
    categoriaId = catRows[0]?.id || null
  }

  // Gerar ocId se não vier do frontend
  const ocId = d.ocId || `OC-${condId}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000)+1000}`

  await sql`
    INSERT INTO ocorrencias (
      id, condominio_id, loja_id, morada,
      categoria_id, categoria_texto, descricao_ai, descricao_final,
      latitude, longitude, maps_link,
      nome_reportante, telefone_reportante, email_reportante,
      status, tem_foto, foto_url, ts_registo
    ) VALUES (
      ${ocId},
      ${condominioId},
      ${lojaId},
      ${morada},
      ${categoriaId},
      ${d.categoria      || null},
      ${d.descricaoAI    || null},
      ${d.descricaoFinal || null},
      ${parseFloat(d.latitude)  || null},
      ${parseFloat(d.longitude) || null},
      ${mapsLink},
      ${d.nome     || null},
      ${d.telefone || null},
      ${d.email    || null},
      'aberta',
      ${d.temFoto === 'true' || !!fotoUrl},
      ${fotoUrl},
      NOW()
    )
  `

  // Emails via Graph API
  try {
    await enviarEmailOcorrencia(c.env, ocId, d, condRows[0], mapsLink)
    if (d.email) await enviarEmailConfirmacaoUtilizador(c.env, ocId, d, condRows[0])
  } catch (_) {}

      return c.json({ ok: true, ocId })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})


// ── HELPER — Upload foto SharePoint ──────────────────────────

async function uploadFotoSharePoint(env, photoBase64, tipo, condId, lojaId) {
  const token = await getMicrosoftToken(env)

  // Obter loja nome para o path
  const sql = neon(env.DATABASE_URL)
  const lojaRows = lojaId
    ? await sql`SELECT nome FROM lojas WHERE id = ${lojaId} LIMIT 1`
    : []
  const lojaNome = lojaRows[0]?.nome || 'SemLoja'

  // Obter drive ID
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
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: bytes
    }
  )

  if (!uploadRes.ok) throw new Error(`Upload foto HTTP ${uploadRes.status}`)
  const fileData = await uploadRes.json()
  return fileData.webUrl || null
}


// ── HELPER — Emails via Graph API ─────────────────────────────

async function enviarEmailGraph(env, para, assunto, corpo, cc) {
  const token = await getMicrosoftToken(env)
  const EMAIL_REMETENTE = 'geral@impar.pt'

  const mensagem = {
    message: {
      subject: assunto,
      body: { contentType: 'Text', content: corpo },
      toRecipients: [{ emailAddress: { address: para } }],
      ...(cc ? { ccRecipients: cc.split(',').map(e => ({ emailAddress: { address: e.trim() } })).filter(e => e.emailAddress.address) } : {})
    },
    saveToSentItems: true
  }

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${EMAIL_REMETENTE}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagem)
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph sendMail HTTP ${res.status}: ${err}`)
  }
}

async function enviarEmailLimpeza(env, d, lojaId) {
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`
  const assunto  = `✅ Limpeza registada — Condomínio ${d.condominio || 'N/A'}`
  const corpo    = [
    'Nova limpeza registada pelo sistema Ímpar.',
    '',
    `Condomínio: ${d.condominio || 'N/A'}`,
    `Hora: ${d.timestamp || 'N/A'}`,
    `Localização: ${mapsLink}`,
    `Foto: ${d.temFoto === 'true' ? '✅ Sim' : '❌ Não'}`
  ].join('\n')
  await enviarEmailGraph(env, 'formigaplicada@gmail.com', assunto, corpo)
}

async function enviarEmailOcorrencia(env, ocId, d, condInfo, mapsLink) {
  const emailGestor = condInfo?.email_gestor || ''
  const assunto = `🚨 Nova Ocorrência ${ocId} — Condomínio ${d.condominio || 'N/A'}`
  const corpo   = [
    'Nova ocorrência registada pelo sistema Ímpar.',
    '',
    `ID: ${ocId}`,
    `Condomínio: ${d.condominio || 'N/A'}`,
    `Hora: ${d.timestamp || 'N/A'}`,
    `Localização: ${mapsLink}`,
    `Foto: ${d.temFoto === 'true' ? '✅ Sim' : '❌ Não'}`,
    `Categoria: ${d.categoria || '—'}`,
    '',
    `Descrição: ${d.descricaoFinal || 'Sem descrição'}`,
    '',
    'Contacto:',
    `  Nome: ${d.nome || 'N/A'}`,
    `  Telefone: ${d.telefone || '—'}`,
    `  Email: ${d.email || '—'}`
  ].join('\n')
  await enviarEmailGraph(env, 'formigaplicada@gmail.com', assunto, corpo, emailGestor)
}

async function enviarEmailConfirmacaoUtilizador(env, ocId, d, condInfo) {
  const emailGestor = condInfo?.email_gestor || ''
  const assunto = `Ocorrência registada — ${ocId}`
  const corpo   = [
    `Olá ${d.nome || ''},`,
    '',
    'A sua ocorrência foi registada com sucesso.',
    '',
    `ID de referência: ${ocId}`,
    `Condomínio: ${d.condominio || 'N/A'}`,
    `Data/Hora: ${d.timestamp || 'N/A'}`,
    `Categoria: ${d.categoria || '—'}`,
    `Descrição: ${d.descricaoFinal || '—'}`,
    '',
    'Entraremos em contacto brevemente.',
    '',
    'Ímpar — Gestão de Condomínios'
  ].join('\n')
  await enviarEmailGraph(env, d.email, assunto, corpo, emailGestor)
}

app.get('/test/email', async (c) => {
  try {
    const token = await getMicrosoftToken(c.env)
    const res = await fetch('https://graph.microsoft.com/v1.0/users/geral@impar.pt/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: '🧪 Teste Worker',
          body: { contentType: 'Text', content: 'Teste' },
          toRecipients: [{ emailAddress: { address: 'formigaplicada@gmail.com' } }]
        },
        saveToSentItems: true
      })
    })
    const body = await res.text()
    return c.json({ status: res.status, body })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  }
})

// Adicionar ao ficheiro de rotas de prestadores existente
// GET /prestadores/:id/contratos?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD

app.get('/prestadores/:id/contratos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()
  const { data_inicio, data_fim } = c.req.query()

  try {
    // Contratos do prestador com info do condomínio e serviços
    const contratos = await sql(
      `SELECT
         c.id,
         c.estado,
         c.data_inicio,
         c.data_fim,
         cd.id        AS condominio_id,
         cd.n_impar   AS condominio_n_impar,
         cd.nome      AS condominio_nome,
         cs.id        AS contrato_servico_id,
         cs.periodicidade,
         s.nome       AS servico_nome
       FROM contratos c
       JOIN condominios cd ON cd.id = c.condominio_id
       JOIN contrato_servicos cs ON cs.contrato_id = c.id
       LEFT JOIN servicos s ON s.id = cs.servico_id
       WHERE c.prestador_id = $1
         AND c.tipo = 'prestador'
       ORDER BY cd.nome ASC, s.nome ASC`,
      [id]
    )

    // Contar limpezas por condomínio no período
    let limpezasPorCondominio = {}
    if (data_inicio && data_fim && contratos.length > 0) {
      const condominioIds = [...new Set(contratos.map(r => r.condominio_id))]
      const limpezas = await sql(
        `SELECT condominio_id, COUNT(*) AS total
         FROM limpezas
         WHERE condominio_id = ANY($1)
           AND ts_checkin >= $2
           AND ts_checkin <= $3
         GROUP BY condominio_id`,
        [condominioIds, data_inicio, data_fim + 'T23:59:59Z']
      )
      for (const l of limpezas) {
        limpezasPorCondominio[l.condominio_id] = Number(l.total)
      }
    }

    const resultado = contratos.map(r => ({
      ...r,
      limpezas_periodo: limpezasPorCondominio[r.condominio_id] ?? null,
    }))

    return c.json({ contratos: resultado })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// =============================================================================
// MÓDULO DD SEPA — ASSINATURA DIGITAL
// Adicionar ao src/index.js do impar-api, antes da linha "export default app"
//
// Requer:
//   - Migration dd_migration.sql já executada no Neon
//   - pdf-lib instalado: npm install pdf-lib  (na pasta API/)
//   - Variável DD_BASE_URL no wrangler.toml [vars]:
//       DD_BASE_URL = "https://my.condexpress.com"
//   - Import no topo do index.js:
//       import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
// =============================================================================

// ── Helpers DD ────────────────────────────────────────────────────────────────

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
  return new Date(date).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}

async function uploadMandatoPDF(env, condominioId, adc, pdfBytes) {
  const sql      = neon(env.DATABASE_URL)
  const msToken  = await getMicrosoftToken(env)
  const GRAPH_USER = 'vitor.lopes@impar.pt'

  // Buscar pasta OneDrive do condomínio
  const cond = await sql`SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}`
  if (!cond[0]?.onedrive_folder_id) throw new Error('Pasta OneDrive não configurada para este condomínio')
  const rootFolderId = cond[0].onedrive_folder_id

  // Criar/garantir subpasta "Debito Direto"
  const folderRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${rootFolderId}/children`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${msToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DD',
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    }
  )
  let ddFolderId
  if (folderRes.ok) {
    ddFolderId = (await folderRes.json()).id
  } else if (folderRes.status === 409) {
    // Pasta já existe — buscar o ID
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${GRAPH_USER}/drive/items/${rootFolderId}/children?$filter=name eq 'Debito Direto'&$select=id,name`,
      { headers: { Authorization: `Bearer ${msToken}` } }
    )
    const listData = await listRes.json()
    ddFolderId = listData.value?.[0]?.id
    if (!ddFolderId) throw new Error('Não foi possível encontrar a pasta DD')
  } else {
    const err = await folderRes.text()
    throw new Error(`Erro ao criar pasta DD: ${folderRes.status} — ${err}`)
  }

  // Upload do PDF
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
    const err = await uploadRes.text()
    throw new Error(`SharePoint upload falhou: ${uploadRes.status} — ${err}`)
  }
  const fileData = await uploadRes.json()
  return fileData.webUrl
}

async function enviarEmailMandato(env, { to, nome, link, adc, expiresAt }) {
  const msToken   = await getMicrosoftToken(env)
  const expiresStr = formatDatePT(expiresAt)
  const html = `
    <p>Exmo(a) Sr(a). ${nome},</p>
    <p>No âmbito da formalização do serviço de gestão de condomínio pela <strong>Rede Ímpar, Lda</strong>,
    solicitamos que proceda à assinatura da Autorização de Débito Direto SEPA
    (referência <strong>${adc}</strong>).</p>
    <p>Por favor clique no botão abaixo para aceder ao formulário seguro:</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#011640;color:#C8DA00;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;font-family:sans-serif">
        Assinar Autorização DD
      </a>
    </p>
    <p style="color:#666;font-size:13px">
      Este link é válido até <strong>${expiresStr}</strong>.<br>
      Após essa data, contacte a Ímpar para obter um novo link.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="color:#999;font-size:11px">
      Rede Ímpar, Lda &bull; Rua São Tomás de Aquino 18-M, 1600-874 Lisboa<br>
      Este email foi enviado automaticamente.
    </p>
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
    <p>Confirmamos a receção da sua Autorização de Débito Direto SEPA
    (referência <strong>${adc}</strong>), assinada em ${dateStr} às ${timeStr}.</p>
    <p>O documento assinado foi guardado nos nossos sistemas.
    Brevemente receberá também o contrato de gestão de condomínio.</p>
    <p>Qualquer dúvida, contacte-nos através de
    <a href="mailto:geral@impar.pt">geral@impar.pt</a>.</p>
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

// =============================================================================
// Função gerarMandatoPDF — substitui a versão anterior no index.js
// Usa o template oficial SEPA como fundo e sobrepõe os dados
// Coordenadas baseadas no template autorizacao_de_debito_direto_sepa-core-022016.pdf
// Dimensões: 595 x 842 pt (A4)
// Conversão: y_pdflib = 842 - top_pdfplumber - altura_linha
// =============================================================================

// =============================================================================
// Função gerarMandatoPDF v2 — template oficial SEPA com rectângulos brancos
// sobre os quadradinhos e texto em maiúsculas
// Coordenadas: pdfplumber top → pdflib y = 842 - top - size
// =============================================================================

async function gerarMandatoPDF(data) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')

  const TEMPLATE_B64 = 'JVBERi0xLjUNJeLjz9MNCjEwIDAgb2JqDTw8L0xpbmVhcml6ZWQgMS9MIDI3MTg1L08gMTIvRSAyMjg4My9OIDEvVCAyNjg4My9IIFsgNTA4IDE3OV0+Pg1lbmRvYmoNICAgICAgICAgICAgICAgICAgDQozNSAwIG9iag08PC9EZWNvZGVQYXJtczw8L0NvbHVtbnMgNC9QcmVkaWN0b3IgMTI+Pi9GaWx0ZXIvRmxhdGVEZWNvZGUvSURbPEI4MzM2QjYyQzYyN0UwMzUyMkY1QTBGNTlGMjlGMjI3PjxFOEVGOEQ3MUU3Q0VDNzQ4QTRFNUMxRjM2OEQ5NDBFOT5dL0luZGV4WzEwIDQwXS9JbmZvIDkgMCBSL0xlbmd0aCAxMDIvUHJldiAyNjg4NC9Sb290IDExIDAgUi9TaXplIDUwL1R5cGUvWFJlZi9XWzEgMiAxXT4+c3RyZWFtDQpo3mJiZBBgYGJgmg8kGPyABONOIMHyDUhwPQISHIuBBNsDIMF6HsRtAxKcsUCCXQLEPQIkuFtAet1BejlAxFoQAdLL0A3nboKxmNahSKwAWsTIMBMkxsBILvGf8f0XgAADAKjIFE8NCmVuZHN0cmVhbQ1lbmRvYmoNc3RhcnR4cmVmDQowDQolJUVPRg0KICAgICAgICAgICANCjQ5IDAgb2JqDTw8L0ZpbHRlci9GbGF0ZURlY29kZS9JIDExNi9MIDEwMC9MZW5ndGggOTMvUyAzOD4+c3RyZWFtDQpo3mJgYBBnYGDyYgCCsDQGVMAIxCwMHA3IYuJQzMDgzsDDrrx+5vaYyKkdxT/FcsVrF19g4BFI49zgwpaYzZaYzuKQxvkAbtImZqiJbWBTGQ6cgfJvAAQYAL+aEncNCmVuZHN0cmVhbQ1lbmRvYmoNMTEgMCBvYmoNPDwvTWV0YWRhdGEgMiAwIFIvUGFnZUxhYmVscyA2IDAgUi9QYWdlcyA4IDAgUi9UeXBlL0NhdGFsb2c+Pg1lbmRvYmoNMTIgMCBvYmoNPDwvQ29udGVudHNbMTQgMCBSIDE1IDAgUiAxNiAwIFIgMTcgMCBSIDE4IDAgUiAxOSAwIFIgMjAgMCBSIDIxIDAgUl0vQ3JvcEJveFswIDAgNTk1LjIyIDg0Ml0vTWVkaWFCb3hbMCAwIDU5NS4yMiA4NDJdL1BhcmVudCA4IDAgUi9SZXNvdXJjZXMgMzYgMCBSL1JvdGF0ZSAwL1R5cGUvUGFnZT4+DWVuZG9iag0xMyAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvRmlyc3QgOTUvTGVuZ3RoIDkxOC9OIDEzL1R5cGUvT2JqU3RtPj5zdHJlYW0NCmje3Fbdb9MwEP9X/AgPxV9x7Eio0lYoTGJjWiJAmvoQWtMFtUmVBDH+e+7suE0yBrR7QchKc76P+O58v7vKmDAiNZEsIdIQKYAESkkSAd8wEnESARkJEmtgSsKlQBbhKoa3IoIpRaKYCIF7TYRMBIkMgW1CXr6ks2pT1ekuX1rcNDGexsgNkAZP9GSCpwI5ndLX9+2btM1bVH+TcvTDC+ZV2QIvywR6g3ZZFqEnnozRCU8aPN8bXdfVMrXtLb1+NaeZvW/pxTZf29mCfnr/+atd4hcvtpwRoZwx0AJc7+gYaB3oiAgTaAg7CbQ+2MYQEg90ctDXPZIdTDHfHQkJiLzL0+ktvZjNzvPGriCpyFwAp1zZe2D45BFIt3xEwolwX1pAZO+vyZd801ggLgmn6Vm3TS8Je8EEzX7s7CHhtNp5+XQKtmfN0pYtMQmns3z31hbru5Zwxhh9Zb1oInhM55t83YDz7nrOz6v724lShkwkg6BBG0xEvHDSeb4tNj+eZcXWNuTKfic31TYvnzvZVb611ElA4PjX6eS82qwuMydP29q2yzt6VdXbfONYH71LGjy6aPNNsTwr1xtLGE1bu/0AdRr7+FAXXa6LXVvV9FMvFBcoZhp1Hjv+dbmsVkW5ph+L8qxsiv1+XtRNO7vLa7jG0SkIG7zYd3mnISJJ02+fW3Qoq79Z59nePfj0qr1rboXCYg/LSEnYXy050tSubvAXnzjWQc8k7o2cBJDj9WLOO22l4p72w6XgPlEnAtvwxrORD3WtTecJUug96gSbvT74IHsyvyKH4/9rjaP7dYygtTgecInpAS5KOsBxTCwATp4IOI+jP0IuGkFuwlUHOs1f6Eg8EXd7L05Dnhwijyt2NPK0Nh2qetWtPGeoObzrMQ4RWe4BTDkkdvu+LuIAsdLX8ZYBOYdeEHYjRDJfW+GN6At84SIJXIdxxgaPwyM8wQp10Rd8d3XrYovY31f+IQ/j6k5M9Gh1S52EcSL64ySWIIO/IvDPI4EPqEFxf6iLcpX3atozjqzgMDTMsbXbnXZapaphpYLGnwtVJWbx1PkcD+cz06e1i6P7xMlZfnjwaQnXo6F8Qmtgv20MHm4P15gfxnIf9AHcATzIMwDMMMa9HC3cmO7aSPLLodJvB+EdPA5twfvk2kKvYezbAsbYaws+Vv/rWoNxlHnKWPyXVmh3h7Y3HNyBN7zJflb6De+nAAMAcn9X5g0KZW5kc3RyZWFtDWVuZG9iag0xNCAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDI0NTk+PnN0cmVhbQ0KSImEV0uT28YRvvNXzCkFqEQIgzd8k7RKyqlYa0u8xTmAwOwKCRdYA6ASyeU/kUP+n0sHlXLXPV9P95DEaoHUVi0H069vevo1z16OmapHpe3fWHebZ396q9XtuImLQGcqy4MkUzpMA12opAiSSA1mc7N5sds82+0iyOxuNnlQFirEn10kaRCTSBLkRRir3d0mVLebIAyjUu3qzRarpFC7f27+6r0xh2ryodtr/ShIvfeVv4UN787XGX6MH4PUMYdRVa/8v+3+DHVbHeg0TNTuyqrTESnGIhO9L3t/m0JwqOh3sl/fKZbePYECsIfE6il/93c6SeJOEkZyEiz4JHkRRCEfxGIXW7pkW993hDn21IBfC7n0xnveM/VEi8hT/Y0spndCUnUvkpOPf1a64g0n9R0jPju6tNhKpaMSzlV5meNaztBC54c4ZWzPj1M/tP629D76OoRmGIDez5961RjlZ0HmXX3Zt1OvrtrB4OetX4LrlQ9///j8ZF2co4Mys66P45hcTxZTsRhZz3tvX0GMdNWT9SwcWII5dDcVaocwYYRXBubVD1XXVBbOZE5WM7EaujvhVYK4wqXkSZBmfPRAl0XhQosskGLlb7PLf+rxH4XYKoklL0MEoPs+/Vgui+jVbpPoIEtgOgrKRAUIYq0DWLYJMaMVQUgMeVk6ahkgNs+SBPNCOA0p14ScB1k0E05ze9mPmk0RJxeS6UwwS9lVjwlmWRAlS4J5HOTJMlz4PoouZLOZcKGX4RbRCtyiXIaL21mGizTIl+6lLNawUmFbBKvDbAWt1vEc7gMnaZ2sQNaRXsaso2gVtGT/47JxuAY6ztdBo+qvgEZBXAadZKug03gFdJrMQCfz7NEZnLUCOouoOy2Bzh7k3kw0n2feQ8M5knHFMFpDuGy4SIN0Jel1kQXhiu0yhsIF2KCVi4ajUBP/omGil8uGo7AMli6ZaMWyYZ0H8ZKriVgsBmYUca9dxAx6sRiYURwH8SJmEIvlwIxQuZdBg7gCGmU9XqpYRFxBjKI+Q/zwvKCvgUZpj9euGPQV3Kjvl7gt5VIa9BXoKPCr0EFfg44yvwod9BXoqPWr0EFfhh6j3K9BJ/oK9Bglfw060S+hozbMxKPQ7i+KP0a/VMBDd/HY0E3jNhUy3HsmEyENQ7Ebi1CZZeK+oWHY+Bh2hv92dVupplKVnRM/VjQYYhQC7Wfv+dUVph9MQT/7CmNj7qma/mOW1poG9CLIPYy5KFLewUyWY1D35tCrlwObwE7TD8G3YyRm1vRyhqdpOnVI3WRoZ0KMg4O5MYPpaqP+ozCh7mlwvruHSdMI1v0HTNXYHkyDUXYIMIIn3sPRWcsMGam45NGHynNydpWeT5De6/7OqD+ov/S3GJbpUAaHsUOtm8KTDK12NomuPSxmTyTNZZSyODpBiJLT+yiWd4wc6d9+gtl4VK8rwuQjTgpPDm/xuQEVmQHXBml0jp6CXiwcXidijGKaRTOiVq3a/AKs1kkqRscFR4H+VN/ZvTs0nZwafKgObrmlkneg9xgvbjY/bVJMpEjAEwwbvZeW/i8DpTfmgbRwh0htWggNUZMs00X5iW6VX9AfZNDssccDPJ4XWXFxm7gOHebynOrViJtIvSP+x95+rAef3mnmvRmU8Qtv9LeJNyGffFyzcOH6LBOeYRhyvI8V+D5/sgz9U2VY4fS7AlPqnUW3j8oOzNarX19f//BKXV2rl9govTe+fbZRGEQ4TZ6V/Oa6jCody9Poyr60ru3/N36EPP4NKYOIqpTpsJt771v7A3O84N3Rp3IwDUf79dlH5fK+2rWx6xHg7SuTaoR9VRHW0fDmUb0QclcLGzPcV0PFq0ZY91ZpOwn/oIQ+suVK1TM7jG6ijwJEw27IAh1ipjy5ITu5IXYvRHblBcrshDIVlMQwQ4dy07If3GVUCIo80HRn2qKzu3VvuTrmJVLmVU9x2Sikjd00fuSxxzKvxhp3rSmxG5akMuejO0RSyrYYoHVecuFM0pjOZSt7TgejupXxuaqR6jbMtJ2sJi7kAx61FLtburwUir/S0tilk4FxKvXn8Hrz6ur6zW+Bvy1xREaye8KGS/Fo7Er29ciGlPwabg9Ht920VLO0NxhZTL0jyUaHQEq8+nCEqI6ozVDc4wbuiR7RjecObemN7Z6/Wyt2YB380TCl8lO3FDSqMcr8S+RuHSI+ONk6YWdX0daLCsFggwq5mqbnoIpzcYE4wAZTBpRIpsGYO67U+/5ga0PBBwADNRQh9h2FOUVHZ0noeFYHRRvtItoKj1monT7FbUF5h82eCw7yQE1mIIbSc0pHRW2ya8DSfmZFXw3ys2Y9vbA3lcuVosTD7nQsNzagVfLB4J3cdiAKSphAf0UtNJQtnaXUto70AeCBdu1Tazq5ILUusArwv7B5S/fA4f1efqFvUCMbYm5cDkDWrf1gH0S4zdy6mP67zMCFIyEeJIY7BJ6HkhgT3+cXZS825vCiqN7aOsSbA4VJ7FUfe9lveN8gd0vH27esauqZCOwUsIF2OivSYu+UyPI1Um49tYcSPZX81qKnE4ioLc1MFFOaI7kNZ1pQftm300WSxBQkMw2jnLpir2EGSEKd86XboeM0fmRSIQkVjXmEimKyCnCzBS54pO+ETn10S19cRfwtsyPNJ9Ew45KPTzQl9jYX7Sx5YKmWU01LtXMxGbpU01qSreI84dNRxMP1FF0UWESpD2gsdvXZx418ktRkZ/xyNNJ9+kZWPduN8L7I05X2uZd2c258g+IWtNr3knPfC2zPVz8OwiI/HYsL1zv+qhzMgTuFupGu+L63Ngc1iW3637BQL/3adh053Sh9qYKbSmzf99zPXQ7RkFTkl0l0ai42OgrXXSiHqeQiLirkKe6B4h5pSUnJRmPpXiVdxxM6bkFFITsH/j1qA50jF69k3rtWBIzVh5iDQvWN2oqlhBeHUHNErOxQfYvHt1L248kT9YXePYN0fVZwz/4ixu4sKRr3TCQjdOiWPlMqoBZO46q2L1EAt7902ukR5OvZo0ReBSG5Oy3wKHE1K+ZmrgtJwRcfqCFR2rY87992suhu6Rd2pne8aIVR3VUd7zS+LUS2erKQwLzhrx70wZVC3M1T9aE/ilaROzrtvTA6K+Zk16hfkcm4stfILe855obrP2IsxTMRJjA+fL/DAMEcanKG2YjTRUmJWamRbTu4EGESo8d6akXGkdTklJwwC7Pau/P/48wkqo19SO3FYTi+ACIlTlxOXjOo2mnvLrjPDt5KG1LqfwIMAHLFChkNCmVuZHN0cmVhbQ1lbmRvYmoNMTUgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAxODg0Pj5zdHJlYW0NCkiJ1FdLc9s2EL7rV+BIeioEIECQPKZNMtPONGlTXTpND7QEx6olKtWjrqfTP95Td7ELipQF1tf6YJH89o3d/Uix+G5WWqnhTyixeDOTShktFku40LoRi8fZL9lTrnW2yytps9Ne3IaLNvzv8rmWRfYgjuF2R7di5VHjdh0eHsVTr5vX0mXtckkGg/CJDQVRfKQzsaZbAZKkuof/LluRxsh1MBXcifxXSGYes0FLtjSY0xyTspSU0oaSelznczR6vMffKhPxwlOUDHe5bLLDkW72JxJZ8v1619GDA/5AwEHzbk93O8K2uawz8Vc+LyHc9/ncQIavv38rPrwT33x8++bbxYePfxMoMSWTCcpkcRMCtwUHXmgK/DU4q7HKX1q8KLP9EX+j9x09vONnT7sTS7FWEOKb9ed7Ao+Hr/CUwjXL81mxpBe+Y9E1u9vQj88N5LcaKrHAbmRIREv53ILC3YntjTTvWIhVt7lKZXBLz9ocqsmWHsgy4azTIc4uMNKqt3Lk1P0oZsqGZdD9Yei0fW5ULDnWjh+sj2tOv4u6u/NhcIlHqbSfR/lRmH7ru3iuj2wxhnylJNgwpZK1dTzHV3v+tqWW7B6keC24TX1uqV+wo0+YRhiH7Ymbmnu9L3uYkaAjlhvCWh6WrY/aj+s4TmseEdKvI+79Qxyaw5HD2uc4/XG2us9xojmvi4m2YU3hlXOUXiizATOx+SwOH26Gec2THs5YrFouKCmEloSgdl0cpCD/yPLr5f3o+RPbplME82xtSWaWEe7YfDTHYgfWWvlbtp/DEfahGNg3KwJgH8DZ/nzpjn95eCGLaJH8tHvPV/7PLxt2uubU/GqUSnwcUxBs6piHPctFwqbc+m5UMxGr2Y6z7IvD98s2uthxuseLkMR/HNuzcrOdFuNiGw9Ueil+oEnQ0tnG9YxWVLFVbE2tsvHAIngUuHC9ABZRtDs1tnHu4BC+gMDGE3DkLdFu8GHcGFV2TwqM3q1ZHKVWBB3ENtdl2FThHpkMCBPOARruRuZhY70DhzAp8MhvVue4LlUfyDrp8mxwpoPZwHybmG8Zye4Y/IZ4I1Pc3ICDCip6CtjhTMHg+paLUlNR8EgglgqrArIbT/Z8XoDwinfDkxh58eIb4GVapzjYnuytCF0HUVJgF3sZknq1WNQChvtupgs4QiXgR7tCllY418jCKchzO1OYo8L8IJ/Fb7O3i5lxokL+F6YopSuEtFXT1GLvZ3ez34UmY8I4jSBKlrVYbsPj7Uw3EAo63MTLuYR22YAPvrib/Tgryxq2Ebth+0M3EIJzFRoGHdi8onayLAhj3R4PWgOcdbUoCyNNQRbsANOysdFuKbW7MMtwMHuGv17MKqmokuECawkldWUplaVaalmVWM5foJS6CrMH3YQT6Ghb2CKscCwr/BiLpIOnTsSN/7EVTbwTZ1IvLwQBYmNnSbApqIfwnp1E19gSdLaYoXWxAMOqayibsS8WMLXC8gwFShtq01t4drCDKl8XwACBqsr+hKDbm2LsPonX8C47pd/A7NVnPHgd4IVqsIvO+iMQu6lOgQaOOwnCmRZFOqzCwWvrRFQVTKudwBuDg5DEjYJBmaiKKWCQJ2ADRZuAbSOrieiMg/ewieRNVU2ab/SkeavKSfO2UFK5CX0YQjXRUtbWUtUTOGyBqcOxlZs8e9uoyZYtlR3Zf4brejQSl/5LAxt/pG5HMM9rUp3HNYU/34pVgaCzcOqKtiIyadm/OfBL5o14H9g6cFaNtNggJ8OrawPvdLtP2eFTLt4EkUB4ZfYH/67gYR319p8ItkH+VSQ+y8QHfNk4N3iV7192K46DF+f7lt6it17s6Cq8yeMLGv3e81s+vW8Git+FN3+dhVgvKLeWTVkZcnzJsAbeTW2oGYBD0sUqq8m9+0KBicUcLSQXc1IAAzSwiQZNWF9QJ8OxSeokdXKTQG8aBw1J1Gl13yVgnk4HjqeqiCp1INUze/aENy8bbJr4BBojUO9QggHi1pFgkZ1vI3PyLdEzBzCgT1Pjxpk4hBcKTJxStJA8paQABlhUWPrnxxTdJ3GmzyTO9Bnxy3OO9Nnrj0Cmz+sg0+d1kOkzFRbTZzIqps8kzvSZwiN9ptwzfSZhos8kzPSZ9M70mdQn+kzCTJ8p85E+U/qRPpP6TJ9JfabPJM70mbTP9JnUZ/pM4ZE+kzjTZ8o/0+dA3Y5gntekOo9rCk9uRugpVUzQJ2y1M38q2GoXBNqK/akVnr4Gun+2+AUJn477nXglLklSSQffS0RHyJGGnWlLvn6Cj0uHX7Rgee/REnyxHkXX4mdvCZTYdkFiFf7z/uxO4NOBz1u/v+BGaPgK1kiKG51t3BVuhBKa/mtw+Ek32GovEei37llgcIqm36YjgfMxXhfAAHX4Ak2TY8Rf3AOwTV3Rf1j+X9gR0lR26hheKKCtgsU2KjIv4qQB3sQvwwsoVHO1DaJ+sg2SApg/LFRdX2mDmF0SZ/JN4ky+EU+Rb69/BsW/AgwACfCNrQ0KZW5kc3RyZWFtDWVuZG9iag0xNiAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDE0MzM+PnN0cmVhbQ0KSInUl0tvHDcMx+/zKXTUFFha78cxdlrAPQQpskAORQ/u2ilc1F7UdlDki/Rb9tRbT6VG1Dy8w8FejSDYXf9J6kGKP0mIL50xFmwSQXnQSYBLQitIQTzddSjaWP7KiF6DMTNRKb3Qg4eZHHNeuscMxm3o2YJPvG5VBB/44a3RsCVbD3FDdhnixuxssBA3Fm9j3Ayf9WZ4h8JWeGcUqLDhbx0ot+HvEqi0oQezmRwXw2buXVZgNnbfK7eIf6LrBHZjfG8N+IW7W8gugtqoPe8TpI3wl/tuCKDw3/BFRwPZCJ8TmKSs2D90O1DKaLE/dErs/+qkEP3+9w6CTxq99u871G0serHESkajn+XVv7d9kvf4/7ej+NhrA0ke8dfzy02vsWDlH/0OvBQXov9l/2N3sd/jwsT+SxfAaRy4RXa2RQ6uRsZgYQim5HOPy5MvPWh5g19LUPwqDmU4I4+3dy12qrEdhOjNNGtTYkfIKegaG9cWjM1gpehxrzQ4eXV/O8zYyNs70WMClDyZs8YizG6MO9usq/uXb2W7pjno2c6ZgMlPwwppW7/f44nDfDk8VFQtlLUhXzrEWi7n6NqpwWqSx1bCuLdWcoZsjIe8UMdadNOoC73VIqPjuj22wjg/JliKc99Rb3XcdLaOU4Dsah2XRqR9qyY1ZXwXI6YbGwmWTq/Ld1xbwI9dKSlRLHyGPJimKuhYjOcWJCAq7CtDI6ef1Xz8iWMO6jCBUlI1/WWZdkrAcOjn6T1Pt0mBDgudUtT8KQUzfdrmVb3MLRlwbqWTtbFZPenSKXk9+5LbUT/BpMrgzcx/IVa4M2KFOyNWuLPTqnDnZ1XhzusV7qxOJ5Idvh45Xh7gzssV7vzoFe68/wB3Xq5wZ8MT3Fl/gjvvX+HO+1e483qFOx+/wp33r3BndYI7r1e4s+NXuM/d1+DOu9Np5XS2KUZsb2qCu3ZjU4ytKYqPN/9gN8M29Vw+HIK6/nyNPgs6h1BxNvDfjPDDS8Dxa7/DYysfX57KFyO/vSKyBeMDkVNVDhYM4sqDI0jKGRiRnJDDBvnONRib4wm/xggcwHiDMsGoQa+VAvmSfHaqAlZYeHP8igqC2UrCmQYWp+NeJYHOVIvAZok1KBPE/YhhJU1teFYniLE6QazpHMRG/zWIrYsEsXWRIMZNiyDGzoogxuoEMU5vEOOGJ4ixcoUYKxPE2NEJYqx/hRgrE8S48A1inH+DGOtPEGP9CWKsThBj4xPEWH+CGKc3iLE6HThu/HbeOJ1tbb581NampgfTd/VxGUIcn1M4e2p6jvj0oS8vwP+wPUGUD73GoeVdb+TTUeAjDZ9/ePbxgYh3fyTP8HEj/hbDC/H68t3gXEOcPj/xpadCmt5yyrTBja2Dvzscjl8fX8TjVxzZyl/7Xem8d0+vyBbARxMnMJpUAo2QlWIncC4fBriVA5CCnWGwbsacfLi/ZnwarbXMMw02emqLwPZU1qBMEOvYmbUCIuemn10gTmOvfHPsw1tEdlMaTh9nZxpo70pfWjy/ah9lA4w7TQar7zfkiEoraWqjszqhj9UJfU3n0Df6r6FvXST0rYuEPm5ahD52VoQ+Vif0cXpDHzc8pYyTW8a48OzZsHh9TdMVvvSUw3iZr2fj8vpKfPrcY0Pz8vqHPba6T7V4Z38rNkPxYrGp7DYbkA2webE+Sx+retY7aIsY93GLqr7aesqZn28v7tDCt+lte5t+sr3YcvA1UvphcnV3F1tgSi2tzPHPbhgiDIFwgTlngf3BYqKwsPH0HR66i+uHLN4fu5/Q2pS3R7Etxex93Z8heDVM1XA2ffYmW24fYzPwJe5y5SQPTpPM1pXGB5l6cz0XLwB+VjynLfVMg/FVOOup9CpsEU56attp1qBMUCW8gvI9d1UW/wswAHdyXxINCmVuZHN0cmVhbQ1lbmRvYmoNMTcgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAxNDE2Pj5zdHJlYW0NCkiJ1Je7juM2FIZ7PwVLaYHh8k6qzSRFUgQLxN0ihbPWLBxkbMA7iyDPmyIPkC5VDslDWZrRL7jdGcC6/DwX8VDnE4V42umkpQnCqySjkC4ppYVWMgVxHXckD17GNMlxGNJcNmqQ3tysF5qx0iag2Sg10jxlZGBGJnhpcEJxkMZhebDS48exKkqPJ8MaLTdUS1OFVTfIiBOzwcqIH9rGuOV70Fu+nfJbvp1RUgVsbZ1UDlu7JFXCcjBb9XAxbNXaDWprcXrl5s7fyDpJi2N7a6SfG7uF6qJUeJ15n2TCvr/b74q5ov9yoqORQ3anaYyyYv+8k0pZLfafdg90Ri/R/s/dx+7dO/Fzr70cukv/QO9B99xTeUw39pRsJ44X8Xgdj32Urrtce62l7d6L/tf9T7v3+z09gNg/7RLlQzOhxP774tuZFiX4GuXx2j+k7PWYj747vVzqCd8X53p5qIfnXlECHCTVIJ4eP5gaRGX/KrvuRL//ndajjJG6RhHrrR/2tMTLdFG5uVQ8bbXPhNhqdc8Am5TUYTFgVrDioSiLAbeSrQ+gBN1AUcLaWqrGk35vwfMK9qYWPL+k2rdakP9SCyH6hxhplug903TQ+dx4GehAs0+HPMIPtCREu0NLI+bB8xEs+LwklgNNd7usw6dLilnUkkAucK2TG4JM6VaGcpiX4d4BU51uA7hOkwcuw2xAm2o0ICeYQnaywisOD/WKO6xX3k06AN7NfoV4QKzIA2JlHkyrQg9nVamH9Yo9qDP3YPgKPiwX8mG5og9Hr+zD9gV+WK70g+4Zf9Ce+YftKwCxfSUg1isCsf/KQGxfIQh1piDWKwZh/MrBufkaCLE5v65Ih52R1qw2EwrV0BqjnUj42A8ydf/2tPa74+nzRRxH8SPd0x1xyxICxz5RWzzXi5fTU9FOZfynwz9/k5q6C0OzXLDd5SreUJOgm6JON2yaKSNqCIzNDMzcUAsw8wkBM+TOfMqXOS+d0zq/1MvTE98fr6/wSV2K/mowq2SwaZhBdIZMl7z0bqvT3jlgoxU3D7AVwwE5wehkSGvrjo2bfvfCoLRj+uaQSY9ptqpwl75RJLaHNUJ6zo0arJmXiGZ5ERvqTEuoMy2b3krc9EbLyX4hMi3XRablusi0RGkxLWFWTEuoMy2R3miJwjMtoVxpCWWmJYzOtIT2lZZQZloi942WyL7REtozLaE90xLqTEvon2kJ7ZmWSG+0hDrTEsVnWs7M3ULmtxWa89uKdNgUfZDOTbQ0U090YblxtHXjmGjTpgfqWCMRidrg8SCuXw9ipJ0dfVZ3/5Xf57yBzHC6rOCQlEATNeHQTiEj71V/KZSL3XUc+UycD/mEPI/cMA/neuNYD+L8lQf8Vo9vwEiLPwxoX2lnOc33lXnRbO5G7tI3mi/bw+aL9JwbNavBzVbaaz42/W4+Oi+1+ub4SF5cuNWgPO2iBncO0E5Rf5vrrR9DB9yQ79MNTdSwkNsiaPZc5dmAWyXXB+Tnp7TDyipoD4dkJjCSGcAso91qs17brK5qTN9VjeELMmL2ooQYvUhm8gK5FRqE5jIitWIXqUxdFJmhi6wrc5HKyAW+G3GBdQMusmbeImvGLZKZtsg5wxZZM2uB3FCLZCYtiM2gvRmv7kqRMb+RQIatlQgTw0RZq1tn9Wa2KdWG9qSR9nnHUzl8Lr8Fu9T5PlzK5ZeXcjj8IfrcGN/wNcrghlBRljFuW6jgaqgPZJdhrrovZev6UvyQv0+UAAW6lOvj+IqftNmK3kx+7bSJ5e+E3JkdTYWpndwbavr8VBTkRE5NdzzkDwOC9rjyXeCk1/TpMn0XhDBR+mP3SPvdPM/dy1+v8tKz56UOaz3tCcluudelcunZJqk1UPG/AAMAgRRmCw0KZW5kc3RyZWFtDWVuZG9iag0xOCAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDE4NTU+PnN0cmVhbQ0KSImMV02P2zYQvftX6CgFMZffoo5pt4cWKZK2vjU9CI534SK2E9uLIv21BXroqf+hb0hKomRRNRZYyXrD4XA+HmeK4mklbM2ULrTmTMiCace5wKNuGlecd6upgMCjHuGK18zYBQVKCnY3LqVhzQg2umZcDus9MhIwjjm9IKCgXTZM2m53wZmz48Ud7lcl+Debld+e48+/iFqyBuZIybTkqtgcVoLVWphis12tGSf9mz9Wv5ZFUa3ruiwqpZnAQ9A7TmfxWDt6kIRpWONFXQBETcKpRASMYGoiKMvhZxDvf2JPj3oDftv8sPpuE9zgWO2WonyngHJwtp2NU6chG6esABmIYzVyJk7d9lncCQpgHm8M7drj0zhL3jAjk/UjUCqmXA5UCFkWRNikzJslrWFywaoaaakX8EYxs3CqrjZz28fSy8IKTluAdYPMX9jdKlYvHF7V9aL6Riyq19wsqkd5Mm4X1qNI+EJKae0Ydwu4lYvB0bVdjL1u+GLKGq5H+m9w4UYlMd3fKMnMaLkewbFes8tjuebwLDMKgV+BGUGHWnXEaHUgxleviveVUEyXbYUEKf+tiLQuFfHbQ2Crh80GthYbJAGzjVTYYvPolZia1PGg6dsTeJCXL8drtSYePX/tVrtutTTY1q/mtBBsuPkdkWFCm6g1fIr8iMNqPdCff0z55x6Bnh8HgcTfXkOkv0RgcPi8ABnILRV8/h7r8P+Nlkblw86mYdaFYI0cAT1i7phfVobuMOsVaYabQDMFbVyxRhfbw+rh+wNu4cfT6ifISnICSRItGhM85FUHSRcEE+NF9uA4S//VUGGNzx1hv3aAc0mqGolD9Ekq6y5JYWdI0uJ9W8F/tnxuD5VomCt3FY5THq8nqCaoLrenM70g8QDpchcWHJGUeFx3hU/sm5SGkISdIfuwpeo3N3HznysQI9Qp7LetBGl7qdb4f4ZGif9r1MouAEcPXIuw2ef2K6xFDsTVqIxxRdTICCWHelK+b5Fwnqj7vkWBuXzLonC/yPIdNsc6al8c8lqVD/S76yyGgyGVhNGDbi37Wi3fnSm5BjsEE1zawQei94GMZsCLrkEplO9bCgHIXPoQGDoUfT8Vn8OT/C3hCPoRoJfwCREU5Sd6FzPUgjgY7JD4wpIReKFmjmx4d6SDNuVufXp6ij743IZvXw+7iE5dbJmtTXQxHNsYNbih8DWGFlcRO4gGhQQpwZxAEnt+GhUhZwnXJI0SIkz9yF045e4YDbd6brERkkq5w2/buBSnK1aP4XDrDNon8FCvs9pxbOXQiukZjovHyuP+YFk4Gt7j8/dlulzPMGx2ebSc24WI3CuQiVl+eXI2bheiFgVyYUs3mI1bfgN/fOVnt0jRYuo4NUx2A5plaDSH3E4HrDhWWRqaqjjkhJGJRqs6TEKmH61cnIlMmJiGX8PnWLsy1C6rTfGMs4AEnCnWuEdwk3R0RgZQb1NHengsHqOaH7E9ulHhXwQ1NW/iLPZmQg4c6sHbTSPg3067oG2HtoaM6wZF60Bn6QhHbtSyyHcg9wpIqZMbNe24ew03F3Fsqe8VcJo6hVGPE3ravI1JsszvQC5Ahphe7+2QmMfDkJjHw5DY45khcVg/MyRmwDAkZsAwJGbNCkNi3qowJObxMCRm8TgkZrcPQ2IeDtSUhcOQmN89DIn59X5IzMMxZXPqu4TM4mEIzOrX6NpNjwtw5O0EmFdeo4pdbnEY/7I7d6WSxWOl5DbPEiuyqR7mM267zkvGBvDtadt+2n9sfUP5sVoTne1u2yfkpFBJ92R1QmFv/WRGLXIbX6770/FmOjOySfpgb0nDdOPMQIS1VPiEfrxqvEfKx4r6MIyO5bWlj7jY3G2TrTB/GZTj0IyqxLzH9hqIezcxSYTOzK8Cj/Nw64y6MnI4d3PcldDPPQILBNxpyPLrnQJ5As7amKTV/A7kAusJK5+THT7NSeZAn8/eD8RIWhMpgnULGlmij2KWGknzKdpiAI5KdDmpDY2hIanpiuUhbDFqcdsviDEtFDAQSUOlwKk+twf/+eD5v6Hof+pe196wT9DXvT1hXlW4lWVio0Evu2BjLz62sUyTCpbUei4eE5cFOXJZKsR90yITibymsRxs4uMMGbykcWTbR3PwEmrLyuCl8LqmC807KbyQjwyIU/YHQ8tj3I3JfbpEk2dzLSRJl2uWyC5iMkmiW7xT3uEhFwc8m0qKijSEyU+FqpsK42T6isY+6uzQhF4u9EOV+2P4SLyCQJUv5/ZDeflQFQ/h95SebDJ60h4yIadf9hUteT76R3v1jxf//1ytQXY7qMbPuvxQTehLJ/SVlMCa3C/Rca4FE5rm0cfuQNv+jH7gvRSXXYV2ony5FIH/9+fd/nq6vIbTnipi4l2Fz+fh9XjdXYq/ihZfBMw0MPN6Cvgel0f5pwfaf/72z1PRbv3L/lAJB8+1pHh3xn3zOux4+dsfqvhPgAEAt8Rysg0KZW5kc3RyZWFtDWVuZG9iag0xOSAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDIzMjY+PnN0cmVhbQ0KSImMV82O48YRvusp+kgCEU2ym3++xTsbYAPYmywEGIE3B0rqmeFaEjUkNeOJ4ZfIwc8Xx4c8QG455auuaonSisJCgNjs+q/qqv6oVKqjrKwKFavF3SyK47RQi9VsjpUp1eJl9kPQKhsmcVQEP4VFsN/gr1nVvLMO50mUBy32elrqQNltmFRRFai1XW3qThj/E6ZREvxOL8yung5WhSXe9nhr1/JCpCUrHSxzd2pHHLypetk9qG9qXu1WbRQmOjKBCv+++PPsq8XCqEQt7mdzHxtEE5NpipAC0ymFiEWScIR/g/YiyoJDR880UF3zwDuPQ++3+GlDg3AeaiZ3a342O+FXwyMvrKqXovXZqm1YwVMR2q1lMdDDQOVcR2XACfCKxRpv2p/2m9pbEv1iWfkNJQwsIV4PtbextTtZwsVz++q1PYjsqt6NtbRLYawbZj2j3vNeF1LdJVYU3+nziVz6mH+MfHFKLo5JoyKOKz53MRUkpmJA9+LTLIHKCmVKo7SKc+Lg/beLmc6VNjoqVGRKVNA/Oju7nyU5bJVCT6oMtDP6E0zH+CVK5zqKSZOJklKttm57O0tKE6VYbWQ1Jw0beCaL+9lfZ5lBZN6JJCU1YxvkHxogO1pOYSJlWpaVUWlO9KKqyjH9m8WsiLBFzriFwZkHf1xEZRrj/G7p1FJCuEPTjM/vux1qQeeypaOU0umhN+pEOlA5NeDvLTpyqDc4n64j63Wt+sPyU73CybDqX/DAVSgxUZUU+jgPUCJvTebBpiZlkOqsatWbcI6gYFKjwelUQrsJ2k4R8c4+2zXWvyrnhkGzz1MMB7ure7XHdFDWeY4D2gxtj8Msry3zdfzmRooO6qF5bvuIg7ts9iKKU0kcFpy4tKqoCC5xrvEz3/iGQ7mzrgeQjRAxNLze0LqXk97Zh7rj9ZpbrQwe+MFdIAoeec+qAy92pGQtm6FxfeK0bJj/9aoy4WGBzcg1sdK0ItWLvWYv4ksfyUuYUTqtMMpAIs/edHYtIQ6ks2VCN+7pWsTWV0N0au7sUjZaL/rrmPteiOFIt6vrWGRbX0ak9geh7cWxfpyMfuxlO8qxzyediiS4nDLn7aQxH9KzU3E5eGTAJGUUQ4PW7hFll+MjySuiSCMfx4cuShonND9kOSdhN0B4MR4gYsRNkKMNWE8rE52mB/q5PJsenszD40TG8Ei4A5Lj+S+JzJGO4yMVmK5XJ2hOifpSBl0Up0nMThrjUizyzskz+imI6wzkHtw2x6mKeVLm58Yn6WVCmZ2m40ooRvLO+IieYo3kneTPiBjUJp8i6vKmZ2kGKHKDnJc0taYdK9MoMzfkq+Lc8Qu6To7n4ap+neZRekve4Mq4JZ9lNxOv0S/FjfRo3Lb6hvoKh+aGewbwT99Ij0nR/jfSawBGzI3wTIZzdx6eOaMXyc3ymDKnJp/Un8XxzfJkSRYlt+TT6mZ5pCknydKTU3QHS8a3a1KkUQ6FRY4HUsG4hPCBfDlUfL2+DXOe42jLYNXJZ8QzvWdBreTb4InfDyHOMN3BCWHSlif97n/bMI0D2xF6USsW+K/jxF1Gjwf337KOP+CuqOgjgaXXYrG3nxyXGOzw8eHeCaL0WGlcMoCa9FERolPozqXXnbOHi1KxEwRhNHYbMUn/OzZsows4Eo8/On4Ivg9RQk33IaWiAeCqx+Kvypvi0Cx982BxYPLWfRU5jzv1yAvnIRDYC3vMu41k6BEYnBV4OvvcP8qNLul9lLQ4K/hOeRKro5QOI3Nrllq+8tPb6GRbQvoM6uN0ZgXGw1WoLzcSBtzpIpAjeD7zv4zB30gnuj/8Ii8XzojuT/8UA7kHG+DxnZ2jsufCns6tc6Jfu5QxK3V65VKGDp1fi/AJDY75apweuvy1uzzTnAJbbWdfvdvmmbprgS2eZilNCmKkGyqjwZV61cKaMuvIdZ1Pxo3j6l1yM+g8aqY6kRPVyeEU3sQPX8gwCTC8/CTAmGQg90xFw20aYEzSBWBM0gVgePoUwDjKXwMY14kCMKYsC8CYJAvAmHRMAMakvACMKboHGFP6PcCYlBeAMSkvAGNSXgDGJJ0BxqR6ARhT4h5gTNIFYEzp9wBjki4AY6T/KsCYtC8AY0q/BxiTdAEYk3QBGJN0bspJsvTkFH0SYBh8gMmoHAOMRGcMML4LC39PbUN8jFVyUal1q+5A47dnux7faJ3ySGTvFwJRLF/CcikPAhfOhL+muy4DooASoW+af/CiZvEORvGletjSzQsos68fagEQDlXwjdrKFS961b8lgKW7PNEuWVkVfGUidH2MvODIm8EhIufMgbRDlapXbYfIEYYgCx0MHXmROqjzM9CRoZzh/b37/zbEuQZMKwJK13FbvflAe+OtD47zF6dBQdlh6Gq2vnfmCEZlLo9BW6uPAVvdsxNRmAmGMLJWLsq5D3OElajO6RFIao4WeC0nyLhzj7X7R+JS0mR7vBbB8JuqGYdsGkcXmUZEHLOrUIIKJQQTDy7lGkj0vh4OiIcVIx5oGVEH260s6wGTZScG0T5PxZ/aiTHkTIKPIWFRTe45TJaKUfssuDcB7iWxQ8Ne71s2AF+ex/EJuPJ4uHVeGdRzXSsWOTAjVToGpVZ78YET4842kKVYjditq3A10yWVgDKvXQ2wwFjiVgNKpBJvUfx7WuIcDI+8Z9WdXfJyaDta4Ax9sMIG3KypLZA4x7KCB2hN9ZdaWAfme/1avfOaAS0d74EffNLEA0okELvayvuPDQvtHq4wo/t48brlxsowPYv02FgJR8e+GXYF6Wn4KbvKOUonmD4ven7Zh66vVl6kZd57ea29bDg/umOCrqvHziI520vTS581siWbL1TiMrB2J+p+DudE/o73//jtW9l//ydZUAdDNEcTo7DBu8X7D7+wzLlDu7VvRUnMqBXpHBQyaSWLu1aK5SvvaulLvvebXPBeirjzdZnTEf6IjyWpVKRevB5RYYXpsv4XpWemY2mPB0AIFz4qUTa4VFz1XBTarueNVnz+Z3/GsGw2rFoeH0MKNTtGvnEWbC1SkggRfhFjjbhn1Wd+DhfpOGV05GzvkvCZh7tTg7K9a4GKR/hCU+r/AgwAxiAYyQ0KZW5kc3RyZWFtDWVuZG9iag0yMCAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDE3NDU+PnN0cmVhbQ0KSImMV02P2zYQvftX8CgBXUakKInKsdketoeiCXwLenBkOVERWxtbm2J/7x7yA/IHOsMZytJGIzgBrI83bzhDkXxv1fbPzZvt1iujtoeNy3VZ21xlanu/gZ8Gf/7bJCrd/rv5Y7vJS2VdrXOvtPNZZuLl3G4OG1OWuvY3B+RVpasZXjin7ZVf1bWf44XX3q0EYHmm0qaMb3OrrZ2TIx7IEzxwS11OK5+XfQs6NjXrKDJjwa8qWkSxnqzQ3sYRTaZ9OR9TxL3Rdo1fF7qa8MPIE9zCvbET/gy0TrtSAnO/Wpktcl2swKXXmV0pzFtduBV+Xc0Lf4XnxujSyflzW+KCkPku09UavyhWJz4v69nE/4J7p/OV9LVHQKQ7k+t8ZXqcrXS9Mr3OWe1W2nMFrLt5e26GV2b18zhf6qyU8xdZtvp5ClPg5pVxW69+Ht6OIswbUsJ/324qXJ4Z/A83prK6hEuNiz7L1fa40VkGCwAOzju4cxWenh+Tdz9TmLhk34XL516lXpfJvqVrt29TGKVMTgEeugM++qRr8Fokux90fenVPkT06Z3RVaLu4cknLaHf2xl4hpIJeIw3lxQ2R9KehhC3S20yY+gUVw8c9f+QJDiShEwBago4cEESsLs6dldQcw9UvofyIdIlAwxjkw4f8uQwfWgobhfeDV249CeahKYPj3FOeiKq4UsLbYa6ifyJ0lP0GfOaRH0IfbSpxRE5kLqukxOP2qq/ue9Q5RkSYK2hsGcdm2YdtJnOTGVWdRBWCew1SQ5uQZfFIjKXxWIZhXqMr/V1z5XauBkxwrSmrzCsaUMrGi4unI4Gyip5OU87Nt7ryk56GnX3G+w8OPhcyOM0jFGrHE4y2Bqw44tSNcfNm4cjqNx9v3kP4Ra3MQZjBwWeKjam51BLoWP1PPSS5Buf4xj8NpwQ884ZDtwrzMxszarcGiB5mZEveRk5AMurgj0R9V/GSf9lnPR/xAX9v/IX9F8ASf/FkUn/ZZj0Xy6M9F/mk/6LOOu/mJ/1X+aT/st80n+ZT/ov40H/5fSk/yKd9V/GSf/F/Kz/Mk76P82/pP/y+KT/Yn7Wfxkn/Zdx0n8Zp00pwrwnJVzU/xIO5av+G8MKmUMtQSL/6o+p8SBYbQo6rPa9egfyBIYgvctRzIJY16DUKfxlk7QXfDgRNuz2/VvFjoFZPcWpPT59b9UhPPZEIIzZbdNybHtJC8gw7NhznBZIR/itwG689L+pS8slP3IEC/O3Jxx0TNd9b88E7FR7QGgAwCVPu7NqUvQW+PTpvAsd4f2P3UVRbqjq3D6Gli7pnQ0KPun7xwvyo1UKAl3YiSyjF3E8067KaaZV/wQqXyXDeUdG5i5y5i4GPxaL+ke0RN1+l2K38EVc0oIVMoIRckWOKdD/5CEHfnDLnxm8BUhncmwV+Be4LdDA0LsWPjnewefd05tu6OnmrD60HN5i83USI1MXXGGIauChQhfDg5wHojy/xcX0S07KoPCTFskTvbwwRTUcRehjapKvs/GHVnHoF8A6ur1wyvBBLrHCEN9wdNdzsao7vBrqaxxhjIXMHP2ZSSHzI/f3fESnSknGtCHiE89omB2e3t21B3DPwKDXsQpaofTu1I+9TfKcp909XpPy+wFuf3GJDmYP/q25RFh5eCIJPvAmdNEljsxFlyigWI+rJl4JlNy8YkY8MCc4c6dmKITMCr4xIHZ0xbmpyOeyJ/i1uuUALC8v192SiLNbEnF2SxGX3NLIX3JLyyC7JWlkdksizG5JLIzdkshntyTh0S1J+aNbEvnslkQ+uyWRz25JxMktienZLUn06JZEnN2SlD+6JRFntzTJv+iWxPHZLUn5o1sScXZLIs5uScRpU4ow70kJF90SDDtxSza6pcyxjL77CRLukn0XLp9HC6AeUkifo0bb4KVMhgqC90MI7fDBoABgGD81ux8Y+NKrfQjqiREcGG7chF8HDwaBj/E9SJwJnmQyzA4fZnnAKljtBbPAfiOYhTqaBU9dPkAbwRKe6Dp0eIXq+drsBrrpUhoNgziWZqTpYwowLaPKceQBWYpTfOE49iB18CD4JvgFHwxgeE9OBCmc89yeGvIcIYrzPb8SQgvz7eGUWxPCvJhL3fiH7ng83xYwyuGIx3VazDXviseFKgVgeabWoyyaEnzenMswrfErDGvc0AqHi6PTMoND2cNOh+U9mwBIYexSf99gJ8JB6EIeMHl1XascTjboyYQTpDlu3jwcq0zd95v3EG5xW2MwykmBp4yN6SkUdlkInVRvrNh5jmPw23BizDtnOHCvMDPdqtzfGCD6gch/JffqfwEGAN1RnFUNCmVuZHN0cmVhbQ1lbmRvYmoNMjEgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0xlbmd0aCAxOTE3Pj5zdHJlYW0NCkiJjFfLjuM2Ft37K7iUBjAjPvSq3Ux1FgkGgw5gIItgFmpZrlLDZbllVxr1vbMYZJ1dVjmXl5TlKlNVMGBRuiTvk+dcCrFb5XklKyuUMtJWQtqyrqfH2K12K1MIlWlZaHytskzhTVYFy1RRSMyLyysl9dL6OpflbL3TOpNrjJWerb8SaittEROaatEynRuZL4iLSmZ6wbBKy9wurK/La8NfyY1SsrDx/Y0upF5abzNZLq3P88XAm6K+CvwbeWWlWdi+RtEsmGdRTWYhPFaXsl4Ir7Va2gX3bI66u3bPXslLtZgeWxUyK+L751m2mJ5c5VItrdf1Ynpya+WC++FMxuT/2qxKKs8MPzdQpZvpTlNmxOZptZZZppXYfF/9lvznr6dUoR6TLl3LIhkHse1Ev+0O537Xt02KXCT//9+Q/nfz86qGEkM7bz6tsIWyYtO6zUzOm4m0wh7bQbRpLU0ypNCZHM4j3oqkSWWVnAdxwtc6eXayL1+bFqo6mSoNG4RT88NmA//EZrdae41rJZXNDel16sqguGS9P23TdZV0B/o/9+majN75Z9ucedCnMGKgKW6eODzT4+mLWzoKPIJ8xwuEX/joZohnt4w1pUhRMu5Z/tIfHtyOvEU7sB2kbmxo2PqNZHCvYvdUjUIsOZ4ZuZSRO9hn83X14yaAK8Lsi3SOvDN0/cgEU5ayvJJfysytfwPtszq7PQHmoebC+Slo1nyhk3FxXmS0Jpe5vhjsHnODPyYP/lzE7E9Y7a2dib1VMTksK60sihuA4BVHxcxjUTHTWBBHWGxafYPEbsuYw2JamcKiUmawqE1MYNHVzF8xsaev2OaevaKrmbyiq5m7oquZuqJix1zRvZm4Yos9b0XFTFuxzT1rRcVMWrPNb3FWVDdTVmxzz1hRMRNWVMx8FRW7cxeV8rGLiWNkVZTIBJMVcVUV8N7WDPif0hIgrAHCp3ZMlQK4gyMsmCrF7mXiWKylcQVIJ3ojFsK8xi06u08skMDy+g3zZHPOIcoJJuBbMIF4wHgTKtBdj3+VHM/u0Q/ucRDDLvAC9JNp/J1ngR/o0Z5fUwOYIc+LJWpASNUEYTdw8mPyGI6G1TEcjcphWV7KfE4MyOe1SBn1Suk3eE01QPPJICjBAWif3McnnExKBob7MFwTHO4pTTzYrX4JpgX1gXuC+lviuQ1vapHsBbRnXIcce2RIc4ZKCiLPxcAaWVSisDVO0lS3KpStrkOfEvoqtFQCfRL1BXnyqfu92w7j6xq8tsZrMGiJsksbZycdOF9clx11NDgLaEC062cwHumB/qrf8juZQSPj2iR6to1f1fslh8mc2w5bWVJ8Mth2cXiyxiw6fD+Sv+kaTPDm5L3ymtUQgBUzr/XktT+N985DnXTOwTzpzwMP/HfRs1deDKv4HU2hon5vGqNd9FOH9yLgEmJqI7MqHoFNf3RgdGweEGGESydouAGHAA+FuB8oCiWSZahhvvtIDZgqn1eZNgGagsqXY0ewc2xSVH/y8oQHuezezneEinnyrm+WmkZFByQoyiYY1q7vTv49tM2enGtOp/7QnJ/H5i6ckpj9tG2B3mSWTZwz7EvBC8l0rTta6BdBVVLCbEH5pB76+8E3530YfH/001sguU0exYuf+uwnuEtJwy9jir9OnPySh4MfUAdP8rt34gL2gAM45nkFgPI5N1PONTvwTxePUTTfnntxpJPtyn6HJOdJ8/sw3rnRO8n2utRU+h5JWJeP1WdktU72RH8m6ei+BkKCgxhQRdPrw4FD8NgxIY7dHVFRuG6BTn64PxWiPRH84ndqD4BZNEoKWIt/9D0KwDOhZDQ4KDOhkWPt7c3Ew+WeKJWpPUR97k6noRG4cdJN0B0HpGnkVzoWRXIcuxNnBEeVwaNhc5mZc4r+p5sg++0ZRTlcDpxhDbnbWYN5B/9Z/CE6HH1LgTs/N9vp+0VPZmj/txQczZkLgYLd9lLf3L7QASqD/w77quSUckewdh0KPzhXQ3j7/jiceHInvnSPDX/e0xXVT52HpdAuLKR1FhjWemxenhBM0Z/EU7Pt0nLe9kQxXmi6MhWXYi+dM3kVwn3/57Z/cBDnwB6FXaPuqBp3s/GFAG7lkJGF4zuRIXc639A505VNU0tIbQcWFdRMohp/FQdfj1HuEHTV0TrUI7SgceOdf1lc63re+eJLJmlUeu+JbCkhZ59En1hHtPTuiNafsg+4cm0ErmG467zxgOO0m7vxap1rzubrCJvyqYP1BdG7jhSARO1w5cCiItZrBzdCiTjxEkoA1YTS7rao6BRT46bfBwpKjMJVrbBXQJExUFhD3TZZ+COit0WtElQUDioKOp+tQ3abfB3EgQ+tQxHj0INORPjIpm/+4Qp3yp0pQ8/gCm3s2u4LCNODNOEGNssJFVDOlo5n/T5YO5dyLY0/Kq8R4+pCMWc9G9LxOVDUmSkJ5HehuOHEPMggsOcZO36I86OHSnHv6bLb8pc+0OY4P3hlnU9W6MC9iq1oBw7Dfs8x7tqzU62DGuAo486R3xp+vKRrA1scwoSCEeJvAQYANKZHkg0KZW5kc3RyZWFtDWVuZG9iag0yMiAwIG9iag08PC9BbHRlcm5hdGUvRGV2aWNlUkdCL0ZpbHRlci9GbGF0ZURlY29kZS9MZW5ndGggMjU5Ny9OIDM+PnN0cmVhbQ0KaN6clndUVNcWh8+9d3qhzTDSGXqTLjCA9C4gHQRRGGYGGMoAwwxNbIioQEQREQFFkKCAAaOhSKyIYiEoqGAPSBBQYjCKqKhkRtZKfHl57+Xl98e939pn73P32XuftS4AJE8fLi8FlgIgmSfgB3o401eFR9Cx/QAGeIABpgAwWempvkHuwUAkLzcXerrICfyL3gwBSPy+ZejpT6eD/0/SrFS+AADIX8TmbE46S8T5Ik7KFKSK7TMipsYkihlGiZkvSlDEcmKOW+Sln30W2VHM7GQeW8TinFPZyWwx94h4e4aQI2LER8QFGVxOpohvi1gzSZjMFfFbcWwyh5kOAIoktgs4rHgRm4iYxA8OdBHxcgBwpLgvOOYLFnCyBOJDuaSkZvO5cfECui5Lj25qbc2ge3IykzgCgaE/k5XI5LPpLinJqUxeNgCLZ/4sGXFt6aIiW5paW1oamhmZflGo/7r4NyXu7SK9CvjcM4jW94ftr/xS6gBgzIpqs+sPW8x+ADq2AiB3/w+b5iEAJEV9a7/xxXlo4nmJFwhSbYyNMzMzjbgclpG4oL/rfzr8DX3xPSPxdr+Xh+7KiWUKkwR0cd1YKUkpQj49PZXJ4tAN/zzE/zjwr/NYGsiJ5fA5PFFEqGjKuLw4Ubt5bK6Am8Kjc3n/qYn/MOxPWpxrkSj1nwA1yghI3aAC5Oc+gKIQARJ5UNz13/vmgw8F4psXpjqxOPefBf37rnCJ+JHOjfsc5xIYTGcJ+RmLa+JrCdCAACQBFcgDFaABdIEhMANWwBY4AjewAviBYBAO1gIWiAfJgA8yQS7YDApAEdgF9oJKUAPqQSNoASdABzgNLoDL4Dq4Ce6AB2AEjIPnYAa8AfMQBGEhMkSB5CFVSAsygMwgBmQPuUE+UCAUDkVDcRAPEkK50BaoCCqFKqFaqBH6FjoFXYCuQgPQPWgUmoJ+hd7DCEyCqbAyrA0bwwzYCfaGg+E1cBycBufA+fBOuAKug4/B7fAF+Dp8Bx6Bn8OzCECICA1RQwwRBuKC+CERSCzCRzYghUg5Uoe0IF1IL3ILGUGmkXcoDIqCoqMMUbYoT1QIioVKQ21AFaMqUUdR7age1C3UKGoG9QlNRiuhDdA2aC/0KnQcOhNdgC5HN6Db0JfQd9Dj6DcYDIaG0cFYYTwx4ZgEzDpMMeYAphVzHjOAGcPMYrFYeawB1g7rh2ViBdgC7H7sMew57CB2HPsWR8Sp4sxw7rgIHA+XhyvHNeHO4gZxE7h5vBReC2+D98Oz8dn4Enw9vgt/Az+OnydIE3QIdoRgQgJhM6GC0EK4RHhIeEUkEtWJ1sQAIpe4iVhBPE68QhwlviPJkPRJLqRIkpC0k3SEdJ50j/SKTCZrkx3JEWQBeSe5kXyR/Jj8VoIiYSThJcGW2ChRJdEuMSjxQhIvqSXpJLlWMkeyXPKk5A3JaSm8lLaUixRTaoNUldQpqWGpWWmKtKm0n3SydLF0k/RV6UkZrIy2jJsMWyZf5rDMRZkxCkLRoLhQWJQtlHrKJco4FUPVoXpRE6hF1G+o/dQZWRnZZbKhslmyVbJnZEdoCE2b5kVLopXQTtCGaO+XKC9xWsJZsmNJy5LBJXNyinKOchy5QrlWuTty7+Xp8m7yifK75TvkHymgFPQVAhQyFQ4qXFKYVqQq2iqyFAsVTyjeV4KV9JUCldYpHVbqU5pVVlH2UE5V3q98UXlahabiqJKgUqZyVmVKlaJqr8pVLVM9p/qMLkt3oifRK+g99Bk1JTVPNaFarVq/2ry6jnqIep56q/ojDYIGQyNWo0yjW2NGU1XTVzNXs1nzvhZei6EVr7VPq1drTltHO0x7m3aH9qSOnI6XTo5Os85DXbKug26abp3ubT2MHkMvUe+A3k19WN9CP16/Sv+GAWxgacA1OGAwsBS91Hopb2nd0mFDkqGTYYZhs+GoEc3IxyjPqMPohbGmcYTxbuNe408mFiZJJvUmD0xlTFeY5pl2mf5qpm/GMqsyu21ONnc332jeaf5ymcEyzrKDy+5aUCx8LbZZdFt8tLSy5Fu2WE5ZaVpFW1VbDTOoDH9GMeOKNdra2Xqj9WnrdzaWNgKbEza/2BraJto22U4u11nOWV6/fMxO3Y5pV2s3Yk+3j7Y/ZD/ioObAdKhzeOKo4ch2bHCccNJzSnA65vTC2cSZ79zmPOdi47Le5bwr4urhWuja7ybjFuJW6fbYXd09zr3ZfcbDwmOdx3lPtKe3527PYS9lL5ZXo9fMCqsV61f0eJO8g7wrvZ/46Pvwfbp8Yd8Vvnt8H67UWslb2eEH/Lz89vg98tfxT/P/PgAT4B9QFfA00DQwN7A3iBIUFdQU9CbYObgk+EGIbogwpDtUMjQytDF0Lsw1rDRsZJXxqvWrrocrhHPDOyOwEaERDRGzq91W7109HmkRWRA5tEZnTdaaq2sV1iatPRMlGcWMOhmNjg6Lbor+wPRj1jFnY7xiqmNmWC6sfaznbEd2GXuKY8cp5UzE2sWWxk7G2cXtiZuKd4gvj5/munAruS8TPBNqEuYS/RKPJC4khSW1JuOSo5NP8WR4ibyeFJWUrJSBVIPUgtSRNJu0vWkzfG9+QzqUvia9U0AV/Uz1CXWFW4WjGfYZVRlvM0MzT2ZJZ/Gy+rL1s3dkT+S453y9DrWOta47Vy13c+7oeqf1tRugDTEbujdqbMzfOL7JY9PRzYTNiZt/yDPJK817vSVsS1e+cv6m/LGtHlubCyQK+AXD22y31WxHbedu799hvmP/jk+F7MJrRSZF5UUfilnF174y/ariq4WdsTv7SyxLDu7C7OLtGtrtsPtoqXRpTunYHt897WX0ssKy13uj9l4tX1Zes4+wT7hvpMKnonO/5v5d+z9UxlfeqXKuaq1Wqt5RPXeAfWDwoOPBlhrlmqKa94e4h+7WetS212nXlR/GHM44/LQ+tL73a8bXjQ0KDUUNH4/wjowcDTza02jV2Nik1FTSDDcLm6eORR67+Y3rN50thi21rbTWouPguPD4s2+jvx064X2i+yTjZMt3Wt9Vt1HaCtuh9uz2mY74jpHO8M6BUytOdXfZdrV9b/T9kdNqp6vOyJ4pOUs4m3924VzOudnzqeenL8RdGOuO6n5wcdXF2z0BPf2XvC9duex++WKvU++5K3ZXTl+1uXrqGuNax3XL6+19Fn1tP1j80NZv2d9+w+pG503rm10DywfODjoMXrjleuvyba/b1++svDMwFDJ0dzhyeOQu++7kvaR7L+9n3J9/sOkh+mHhI6lH5Y+VHtf9qPdj64jlyJlR19G+J0FPHoyxxp7/lP7Th/H8p+Sn5ROqE42TZpOnp9ynbj5b/Wz8eerz+emCn6V/rn6h++K7Xxx/6ZtZNTP+kv9y4dfiV/Kvjrxe9rp71n/28ZvkN/NzhW/l3x59x3jX+z7s/cR85gfsh4qPeh+7Pnl/eriQvLDwmwADAPeE8/sNCmVuZHN0cmVhbQ1lbmRvYmoNMjMgMCBvYmoNPDwvTGVuZ3RoIDIxPj5zdHJlYW0NCn9/fwAAAJmZmd/f3xMTE6mpqTU1NQ0KZW5kc3RyZWFtDWVuZG9iag0yNCAwIG9iag08PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDE5ND4+c3RyZWFtDQpo3gTBPQpAYAAAUFlkUVJEys8mJrkAGUwysCjLN9kwoYTsBgbFgElJ2WQxuImreK+qKgiCxnFsmqau6/M8p2kiSbIoir7vkyRZ19W2bdM0v+9jGIaiKIIgDMNI0zTLMgRB9n2naRrH8eu6dF1XVXXbNgCA53lt25Zl6TiOKIoYhs3zjKKoLMtd11mWFQRBHMdRFOV57rrusiyCIDzPcxwHDMM8zw/DEIah7/vv+2qapigKy7KSJHEcd9/3L8AAA81E5g0KZW5kc3RyZWFtDWVuZG9iag0yNSAwIG9iag08PC9CaXRzUGVyQ29tcG9uZW50IDEvRmlsdGVyL0ZsYXRlRGVjb2RlL0hlaWdodCA3L0ltYWdlTWFzayB0cnVlL0xlbmd0aCAyNC9TdWJ0eXBlL0ltYWdlL1R5cGUvWE9iamVjdC9XaWR0aCA3MzE+PnN0cmVhbQ0KaN76/38UoIMHDDQDo4GLBQAEGAAtxCfWDQplbmRzdHJlYW0NZW5kb2JqDTI2IDAgb2JqDTw8L0JpdHNQZXJDb21wb25lbnQgNC9Db2xvclNwYWNlIDM4IDAgUi9GaWx0ZXIvRmxhdGVEZWNvZGUvSGVpZ2h0IDcvTGVuZ3RoIDYyL01hc2sgMjUgMCBSL1N1YnR5cGUvSW1hZ2UvVHlwZS9YT2JqZWN0L1dpZHRoIDczMT4+c3RyZWFtDQpo3mJgGAWjYJgCRkFFIUFFmhDCgo6CjiKjhKNgoKhgoGAYMLQFR0ObXqGdMJq26Zu2R8EoGKYAIMAAet2PXQ0KZW5kc3RyZWFtDWVuZG9iag0yNyAwIG9iag08PC9CaXRzUGVyQ29tcG9uZW50IDgvQ29sb3JTcGFjZSAzNyAwIFIvSGVpZ2h0IDEvTGVuZ3RoIDkvU3VidHlwZS9JbWFnZS9UeXBlL1hPYmplY3QvV2lkdGggMz4+c3RyZWFtDQoAAAAAAAAqKioNCmVuZHN0cmVhbQ1lbmRvYmoNMjggMCBvYmoNPDwvQml0c1BlckNvbXBvbmVudCAxL0ZpbHRlci9GbGF0ZURlY29kZS9IZWlnaHQgOC9JbWFnZU1hc2sgdHJ1ZS9MZW5ndGggMjQvU3VidHlwZS9JbWFnZS9UeXBlL1hPYmplY3QvV2lkdGggNzMxPj5zdHJlYW0NCmje+v9/FKCDBww0A6OBS2cAEGAAJceDeg0KZW5kc3RyZWFtDWVuZG9iag0yOSAwIG9iag08PC9CaXRzUGVyQ29tcG9uZW50IDgvQ29sb3JTcGFjZSAzOSAwIFIvRmlsdGVyL0ZsYXRlRGVjb2RlL0hlaWdodCA4L0xlbmd0aCAyNjkvTWFzayAyOCAwIFIvU3VidHlwZS9JbWFnZS9UeXBlL1hPYmplY3QvV2lkdGggNzMxPj5zdHJlYW0NCmje7JRbT8JAEEY5UCqg3BS1BQQVRRRFUFC89P//LWd3pyTqi28GMl/O5DtJuy+byRYKFovFYtmqAMWc7bFSScaXWhRRLoMSKmbv13+VCnHsPrlSq1b/drZWY/8AHFpQr9NoQrPpIFirRQPa+GlvLJI6zNE6Eut42Nix2IlHSziFJJXxpdaFXt9PwM2ZHBoIQ4fa+QUMB4pWfAn9noO+2mh0xXWaOLTSZDy+YVJk4qaY2+0d02lHwBHs/oHZrIsSKn5kPk9wzBO1xeLp+ds9C8sl0QpWbgIyL7yu1wg4gr3x/vNOhQ+xTw9qWZZvtq22rfaOrXZmr7at9g6/2haLxWKxWCz/nC8BBgAJYVhQDQplbmRzdHJlYW0NZW5kb2JqDTMwIDAgb2JqDTw8L0JpdHNQZXJDb21wb25lbnQgMS9GaWx0ZXIvRmxhdGVEZWNvZGUvSGVpZ2h0IDcvSW1hZ2VNYXNrIHRydWUvTGVuZ3RoIDI0L1N1YnR5cGUvSW1hZ2UvVHlwZS9YT2JqZWN0L1dpZHRoIDczMT4+c3RyZWFtDQpo3vr/fxSggwcMNAOjgYsFAAQYAC3EJ9YNCmVuZHN0cmVhbQ1lbmRvYmoNMzEgMCBvYmoNPDwvQml0c1BlckNvbXBvbmVudCA4L0NvbG9yU3BhY2UgMzkgMCBSL0ZpbHRlci9GbGF0ZURlY29kZS9IZWlnaHQgNy9MZW5ndGggMjY1L01hc2sgMzAgMCBSL1N1YnR5cGUvSW1hZ2UvVHlwZS9YT2JqZWN0L1dpZHRoIDczMT4+c3RyZWFtDQpo3uyUW0/CQBBGOVAqoNwUtQUEFEUURVBQvPT//y1nd6ck6ouvkPlyJt9J2n3ZTLZQsFgsFstOBSjm7I6VSjK+1KKIchmUUDEHf/6rVIhj98mVWrX6v7O1GodH4NCCep1GE5pNB8FaLRrQxk97a5HUcY7WiVjHw9ZOxc48WsI5JKmML7Uu9Pp+Am4u5NBAGDrURpcwHCha8RX0ew76auPxNTdp4tBKk8nklmmRqZtibnf3zGYdAUewh0fm8y5KqPiJxSLBsUjUlsvnlx/3LKxWRGtYuwnIvPK22SDgCPbOx+87FT7FvjyoZVm+2bbattp7ttqZvdq22nv8alssFotld/ItwADOHlhQDQplbmRzdHJlYW0NZW5kb2JqDTMyIDAgb2JqDTw8L0JpdHNQZXJDb21wb25lbnQgOC9Db2xvclNwYWNlIDM3IDAgUi9IZWlnaHQgMS9MZW5ndGggOS9TdWJ0eXBlL0ltYWdlL1R5cGUvWE9iamVjdC9XaWR0aCAzPj5zdHJlYW0NCgAAAAAAADg4OA0KZW5kc3RyZWFtDWVuZG9iag0zMyAwIG9iag08PC9CaXRzUGVyQ29tcG9uZW50IDEvRmlsdGVyL0ZsYXRlRGVjb2RlL0hlaWdodCA4L0ltYWdlTWFzayB0cnVlL0xlbmd0aCAyNC9TdWJ0eXBlL0ltYWdlL1R5cGUvWE9iamVjdC9XaWR0aCA3MzE+PnN0cmVhbQ0KaN76/38UoIMHDDQDo4FLZwAQYAAlx4N6DQplbmRzdHJlYW0NZW5kb2JqDTM0IDAgb2JqDTw8L0JpdHNQZXJDb21wb25lbnQgNC9Db2xvclNwYWNlIDM4IDAgUi9GaWx0ZXIvRmxhdGVEZWNvZGUvSGVpZ2h0IDgvTGVuZ3RoIDY1L01hc2sgMzMgMCBSL1N1YnR5cGUvSW1hZ2UvVHlwZS9YT2JqZWN0L1dpZHRoIDczMT4+c3RyZWFtDQpo3mJgGAWjYJgCRkFFIUFFmhDCgo6CjiKjhKNgoKhgoGAYMLQFR0ObXqGdMJq26Zu2R8EoGAWjgGIAEGAAfdaPXQ0KZW5kc3RyZWFtDWVuZG9iag0xIDAgb2JqDTw8L0ZpbHRlci9GbGF0ZURlY29kZS9GaXJzdCA5L0xlbmd0aCA0Mi9OIDIvVHlwZS9PYmpTdG0+PnN0cmVhbQ0KaN4yUzBQMFcwtFCwsdH3K80tjgZxDRSCYu3sgCLB+i52dgABBgCNhQg3DQplbmRzdHJlYW0NZW5kb2JqDTIgMCBvYmoNPDwvTGVuZ3RoIDM0MzMvU3VidHlwZS9YTUwvVHlwZS9NZXRhZGF0YT4+c3RyZWFtDQo8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/Pgo8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA1LjItYzAwMSA2My4xMzk0MzksIDIwMTAvMDkvMjctMTM6Mzc6MjYgICAgICAgICI+CiAgIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyI+CiAgICAgICAgIDx4bXA6Q3JlYXRlRGF0ZT4yMDE2LTAxLTI5VDE4OjExOjMyWjwveG1wOkNyZWF0ZURhdGU+CiAgICAgICAgIDx4bXA6TW9kaWZ5RGF0ZT4yMDE2LTAyLTAxVDEzOjI0OjUyWjwveG1wOk1vZGlmeURhdGU+CiAgICAgICAgIDx4bXA6TWV0YWRhdGFEYXRlPjIwMTYtMDItMDFUMTM6MjQ6NTJaPC94bXA6TWV0YWRhdGFEYXRlPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6cGRmPSJodHRwOi8vbnMuYWRvYmUuY29tL3BkZi8xLjMvIj4KICAgICAgICAgPHBkZjpQcm9kdWNlcj5BY3JvYmF0IERpc3RpbGxlciAxMC4xLjUgKFdpbmRvd3MpPC9wZGY6UHJvZHVjZXI+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iPgogICAgICAgICA8ZGM6Zm9ybWF0PmFwcGxpY2F0aW9uL3BkZjwvZGM6Zm9ybWF0PgogICAgICAgICA8ZGM6dGl0bGU+CiAgICAgICAgICAgIDxyZGY6QWx0PgogICAgICAgICAgICAgICA8cmRmOmxpIHhtbDpsYW5nPSJ4LWRlZmF1bHQiPnVudGl0bGVkPC9yZGY6bGk+CiAgICAgICAgICAgIDwvcmRmOkFsdD4KICAgICAgICAgPC9kYzp0aXRsZT4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgICAgIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIj4KICAgICAgICAgPHhtcE1NOkRvY3VtZW50SUQ+dXVpZDplODg5NTk3My1iNDkxLTRjZGUtYjFhYy02MDI1NjYwNGRlY2Y8L3htcE1NOkRvY3VtZW50SUQ+CiAgICAgICAgIDx4bXBNTTpJbnN0YW5jZUlEPnV1aWQ6NzQwYTg1YWItYTY3MC00MzczLWI5ZTktMmFmMjI4NjdmOGVjPC94bXBNTTpJbnN0YW5jZUlEPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSJ3Ij8+DQplbmRzdHJlYW0NZW5kb2JqDTMgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0ZpcnN0IDQvTGVuZ3RoIDQ5L04gMS9UeXBlL09ialN0bT4+c3RyZWFtDQpo3rJQMFCwsdF3zi/NK1Ew1PfOTCmONjQCCgbF6odUFqTqBySmpxbb2QEEGADf+gutDQplbmRzdHJlYW0NZW5kb2JqDTQgMCBvYmoNPDwvRmlsdGVyL0ZsYXRlRGVjb2RlL0ZpcnN0IDQvTGVuZ3RoIDEyMy9OIDEvVHlwZS9PYmpTdG0+PnN0cmVhbQ0KaN6yVDBQsLHRdy5KTSzJzM9zSSxJ1XCxMjIwNDMwNLI0tDA0NDaK0tT3zU9BlgISQHETU5BUQFF+SmlyapGGY3JRflJiiYJLZnFJZk5OapGCoYGeoZ6pQoxGeGZeSn55cYympn5IZklOqkZpXgmITtG0swMIMABY0SavDQplbmRzdHJlYW0NZW5kb2JqDTUgMCBvYmoNPDwvRGVjb2RlUGFybXM8PC9Db2x1bW5zIDQvUHJlZGljdG9yIDEyPj4vRmlsdGVyL0ZsYXRlRGVjb2RlL0lEWzxCODMzNkI2MkM2MjdFMDM1MjJGNUEwRjU5RjI5RjIyNz48RThFRjhENzFFN0NFQzc0OEE0RTVDMUYzNjhEOTQwRTk+XS9JbmZvIDkgMCBSL0xlbmd0aCA0OC9Sb290IDExIDAgUi9TaXplIDEwL1R5cGUvWFJlZi9XWzEgMiAxXT4+c3RyZWFtDQpo3mJiAAImxshkBiYGhjYgwbcNSDD2gogbQInpf0ESDIxAguk/kGBkAAgwAJDWBhsNCmVuZHN0cmVhbQ1lbmRvYmoNc3RhcnR4cmVmDQoxMTYNCiUlRU9GDQo='

  const templateBytes = Uint8Array.from(atob(TEMPLATE_B64), c => c.charCodeAt(0))
  const pdfDoc = await PDFDocument.load(templateBytes)
  const page   = pdfDoc.getPages()[0]

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const BLACK = rgb(0, 0, 0)
  const WHITE = rgb(1, 1, 1)
  const NAVY  = rgb(0.004, 0.086, 0.251)
  const LIME  = rgb(0.784, 0.855, 0)
  const H = 842

  // Helper: cobrir quadradinhos com rectângulo branco e escrever texto
  const campo = (text, x0, top, width, size = 8, font = fontReg, color = BLACK) => {
    if (!text) return
    const y = H - top - size - 1
    // Rectângulo branco para cobrir quadradinhos
    page.drawRectangle({ x: x0, y: y - 2, width, height: size + 4, color: WHITE })
    // Texto em maiúsculas
    page.drawText(String(text).toUpperCase(), { x: x0 + 2, y, size, font, color })
  }

  // ── Bloco Credor (canto superior direito) ─────────────────────────────────
  page.drawRectangle({ x: 388, y: H - 80, width: 172, height: 55, color: NAVY })
  page.drawText('Rede Impar, Lda', { x: 393, y: H - 52, size: 11, font: fontBold, color: LIME })
  page.drawText('PT18ZZZ114843', { x: 393, y: H - 64, size: 8, font: fontReg, color: WHITE })
  page.drawText('Gestao de Condominios', { x: 393, y: H - 74, size: 7, font: fontReg, color: WHITE })

  // ── Referência ADD (linha top~55-70) ──────────────────────────────────────
  campo(data.adc, 42, 57, 280, 8, fontBold)

  // ── Devedor: Nome (top~180-190) ───────────────────────────────────────────
  campo(data.nomeDevedor, 176, 182, 380, 8)

  // ── Devedor: Morada (top~205-215) ─────────────────────────────────────────
  campo(data.moradaDevedor, 176, 207, 380, 8)

  // ── Devedor: CP (top~225-235) e Cidade (mesma linha, x~350) ──────────────
  campo(data.cpDevedor,    176, 228, 155, 8)
  campo(data.cidadeDevedor, 345, 228, 210, 8)

  // ── Devedor: País (top~250-260) ───────────────────────────────────────────
  campo('Portugal', 176, 252, 380, 8)

  // ── IBAN (top~270-280) ────────────────────────────────────────────────────
  const ibanFmt = data.iban ? data.iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim() : ''
  campo(ibanFmt, 176, 272, 380, 8, fontBold)

  // ── BIC (top~295-305) ─────────────────────────────────────────────────────
  campo(data.bic || '', 176, 297, 200, 8)

  // ── Credor: Nome (top~320-335) ────────────────────────────────────────────
  campo(data.credorNome || 'Rede Impar, Lda', 176, 322, 380, 8)

  // ── Credor: ID (top~345-355) ──────────────────────────────────────────────
  campo(data.credorId || 'PT18ZZZ114843', 176, 347, 380, 8)

  // ── Credor: Morada (top~365-380) ─────────────────────────────────────────
  campo('Av. Dr. Manuel de Arriaga, N 5 F', 176, 367, 380, 8)

  // ── Credor: CP e Cidade (top~390-400) ────────────────────────────────────
  campo('2900-474', 176, 392, 155, 8)
  campo('Setubal', 345, 392, 210, 8)

  // ── Credor: País (top~415-425) ───────────────────────────────────────────
  campo('Portugal', 176, 417, 380, 8)

  // ── Tipo pagamento: Recorrente — cobrir checkbox e escrever X (top~450) ──
  page.drawRectangle({ x: 352, y: H - 455, width: 12, height: 12, color: WHITE })
  page.drawText('X', { x: 354, y: H - 453, size: 9, font: fontBold, color: BLACK })

  // ── Localidade assinatura (top~460-470) ───────────────────────────────────
  campo(data.cidadeDevedor || 'Portugal', 176, 462, 220, 8)

  // ── Data DD MM AA (top~460) ───────────────────────────────────────────────
  const d = data.signedAt
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(2)
  // Cobrir os campos D D M M A A
  page.drawRectangle({ x: 400, y: H - 472, width: 80, height: 12, color: WHITE })
  page.drawText(dd + '  ' + mm + '  ' + aa, { x: 403, y: H - 470, size: 8, font: fontReg, color: BLACK })

  // ── Assinatura (top~480-500) ──────────────────────────────────────────────
  if (data.signaturePng) {
    try {
      const b64sig = data.signaturePng.replace(/^data:image\/png;base64,/, '')
      const sigBytes = Uint8Array.from(atob(b64sig), c => c.charCodeAt(0))
      const img = await pdfDoc.embedPng(sigBytes)
      page.drawRectangle({ x: 173, y: H - 500, width: 383, height: 20, color: WHITE })
      page.drawImage(img, { x: 176, y: H - 500, width: 200, height: 18 })
    } catch (_) {}
  }

  // ── Rodapé integridade ────────────────────────────────────────────────────
  page.drawText(
    'Assinado digitalmente em ' + data.signedAt.toISOString() + ' | IP: ' + data.signedIp,
    { x: 36, y: 6, size: 5.5, font: fontReg, color: rgb(0.5, 0.5, 0.5) }
  )

  return await pdfDoc.save()
}


// ── POST /dd/mandatos/create  (requer auth — chamado pelo backoffice) ──────────

app.post('/dd/mandatos/create', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { condominio_id, nome_devedor, email_devedor, iban, adc } = body

  if (!condominio_id || !nome_devedor || !email_devedor || !adc) {
    return c.json({ error: 'Campos obrigatórios: condominio_id, nome_devedor, email_devedor, adc' }, 400)
  }

  const token     = gerarTokenDD()
  const expiresAt = expiresAtDD(7)

  try {
    const rows = await sql`
      INSERT INTO mandatos_dd (
        condominio_id, adc, iban,
        data_assinatura, estado,
        token, token_expires_at,
        nome_devedor, email_devedor
      ) VALUES (
        ${condominio_id}, ${adc}, ${iban || ''},
        CURRENT_DATE, 'pendente',
        ${token}, ${expiresAt},
        ${nome_devedor}, ${email_devedor}
      )
      RETURNING id, token, adc
    `
    const mandato = rows[0]
    const link    = `${c.env.DD_BASE_URL}/dd/assinar?t=${token}`

    await enviarEmailMandato(c.env, {
      to: email_devedor, nome: nome_devedor,
      link, adc, expiresAt: new Date(expiresAt),
    })

    return c.json({ id: mandato.id, token: mandato.token, link, adc: mandato.adc, email: email_devedor })
  } catch (err) {
    console.error('[dd/mandatos/create]', err)
    return c.json({ error: err.message }, 500)
  }
})

// ── GET /dd/assinar/:token  (pública — chamada pela página do cliente) ─────────

app.get('/dd/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  try {
    const rows = await sql`
      SELECT
        m.id, m.adc, m.iban, m.estado,
        m.nome_devedor, m.email_devedor,
        m.token_expires_at, m.signed_at,
        cond.nome        AS condominio_nome,
        cond.morada      AS condominio_morada,
        cond.codigo_postal  AS condominio_cp,
        cond.cidade  AS condominio_cidade,
        b.nome           AS banco_nome,
        b.bic            AS banco_bic,
        cr.nome          AS credor_nome,
        cr.creditor_identifier AS credor_id
      FROM mandatos_dd m
      JOIN condominios cond ON cond.id = m.condominio_id
      LEFT JOIN bancos b    ON b.id    = m.banco_id
      CROSS JOIN dd_creditor cr
      WHERE m.token = ${token}
      LIMIT 1
    `

    if (rows.length === 0) return c.json({ error: 'Link inválido ou expirado' }, 404)
    const m = rows[0]

    if (m.estado === 'activo') return c.json({ error: 'Este mandato já foi assinado', signed: true }, 410)
    if (new Date(m.token_expires_at) < new Date()) return c.json({ error: 'Este link expirou. Contacte a Ímpar para obter um novo link.', expired: true }, 410)

    return c.json({
      adc:          m.adc,
      iban:         m.iban ? formatIBANDD(m.iban) : '',
      bic:          m.banco_bic || '',
      nome_devedor: m.nome_devedor,
      condominio: {
        nome:       m.condominio_nome,
        morada:     m.condominio_morada,
        cod_postal: m.condominio_cp,
        cidade:     m.condominio_cidade,
      },
      credor: {
        nome:       m.credor_nome || 'Rede Ímpar, Lda',
        identifier: m.credor_id  || 'PT18ZZZ114843',
      },
    })
  } catch (err) {
    console.error('[dd/assinar GET]', err)
    return c.json({ error: 'Erro interno' }, 500)
  }
})

// ── POST /dd/assinar/:token  (pública — submissão da assinatura) ───────────────

app.post('/dd/assinar/:token', async (c) => {
  const sql   = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')
  const ip    = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
  const body  = await c.req.json()
  const { iban, bic, banco_id, nome_devedor, signature_png } = body

  if (!iban || !signature_png || !nome_devedor) {
    return c.json({ error: 'Campos obrigatórios: iban, nome_devedor, signature_png' }, 400)
  }

  const ibanClean = iban.replace(/\s/g, '').toUpperCase()
  if (!/^PT\d{23}$/.test(ibanClean)) {
    return c.json({ error: 'IBAN inválido. Deve começar por PT seguido de 23 dígitos.' }, 400)
  }

  try {
    const rows = await sql`
      SELECT m.*,
             cond.nome       AS condo_nome,
             cond.morada,
             cond.codigo_postal,
             cond.cidade,
             cr.nome         AS credor_nome,
             cr.creditor_identifier,
             b.bic           AS banco_bic
      FROM mandatos_dd m
      JOIN condominios cond ON cond.id = m.condominio_id
      CROSS JOIN dd_creditor cr
      LEFT JOIN bancos b    ON b.id   = m.banco_id
      WHERE m.token = ${token}
      LIMIT 1
    `

    if (rows.length === 0) return c.json({ error: 'Link inválido' }, 404)
    const m = rows[0]

    if (m.estado === 'activo')                          return c.json({ error: 'Já assinado', signed: true }, 410)
    if (new Date(m.token_expires_at) < new Date())     return c.json({ error: 'Link expirado' }, 410)

    const signedAt  = new Date()
    const finalBic  = bic || m.banco_bic || ''

    // Gerar PDF
    const pdfBytes = await gerarMandatoPDF({
      adc:          m.adc,
      nomeDevedor:  nome_devedor,
      moradaDevedor: m.morada || '',
      cpDevedor:    m.cod_postal || '',
      cidadeDevedor: m.localidade || '',
      iban:         ibanClean,
      bic:          finalBic,
      signaturePng: signature_png,
      signedAt,
      signedIp:     ip,
    })

    // Upload SharePoint
    const pdfUrl = await uploadMandatoPDF(c.env, m.condominio_id, m.adc, pdfBytes)

    // Actualizar registo
    await sql`
      UPDATE mandatos_dd SET
        iban          = ${ibanClean},
        banco_id      = ${banco_id || m.banco_id},
        nome_devedor  = ${nome_devedor},
        signature_png = ${signature_png},
        signed_at     = ${signedAt.toISOString()},
        signed_ip     = ${ip},
        pdf_url       = ${pdfUrl},
        estado        = 'activo',
        data_assinatura = CURRENT_DATE,
        atualizado_em = NOW()
      WHERE token = ${token}
    `

    // Email de confirmação
    await enviarEmailConfirmacao(c.env, {
      toCliente:   m.email_devedor,
      nomeCliente: nome_devedor,
      adc:         m.adc,
      signedAt,
    })

    return c.json({ success: true, adc: m.adc })
  } catch (err) {
    console.error('[dd/assinar POST]', err)
    return c.json({ error: err.message }, 500)
  }
})

// ── GET /dd/bancos  (pública — para popular o select na página cliente) ────────

app.get('/dd/bancos', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`SELECT id, nome, bic FROM bancos ORDER BY nome`
  return c.json(rows)
})

// ─────────────────────────────────────────────────────────────────────────────
// CRON HANDLER — substitui o export default existente no index.js
//
// O cron de "0 2 * * *"  (2h UTC) corre a sync de lojas
// O cron de "0 17 * * *" (17h UTC) corre os alertas de reuniões (já existia)
//
// export default {
//   fetch: app.fetch,
//   async scheduled(event, env, ctx) {
//     if (event.cron === '0 2 * * *') {
//       const sql = neon(env.DATABASE_URL)
//       ctx.waitUntil(syncTodasAsLojas(env, sql))
//     }
//     if (event.cron === '0 17 * * *') {
//       ctx.waitUntil(enviarAlertasReunioes(env))
//     }
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CRON HANDLER — adicionar ao export default
// ─────────────────────────────────────────────────────────────────────────────
// No export default do Worker, adiciona o handler scheduled:
//
// export default {
//   fetch: app.fetch,
//   async scheduled(event, env, ctx) {
//     ctx.waitUntil(enviarAlertasReunioes(env))
//   }
// }
//
// Se o teu export atual é apenas:
//   export default app
// tens de mudar para o formato acima.
// =============================================================================

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enviarAlertasReunioes(env))
  }
}