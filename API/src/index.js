import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'

const app = new Hono()

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
  const allowed = ['http://localhost:5173', 'https://condexpress.pages.dev', 'https://app.condexpress.com']
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
    LEFT JOIN condominios c ON c.id = o.condominio_id
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
  const { data_inicio, data_fim } = c.req.query()

  const inicio = data_inicio || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fim = data_fim || new Date().toISOString()

  const [por_estado, por_categoria, por_loja, limpezas, tempo_medio] = await Promise.all([
    // Ocorrências por estado
    sql`
      SELECT status, COUNT(*) as total
      FROM ocorrencias
      WHERE criado_em >= ${inicio} AND criado_em <= ${fim}
      GROUP BY status
      ORDER BY status
    `,
    // Ocorrências por categoria
    sql`
      SELECT 
        COALESCE(cat.nome, o.categoria_texto, 'Sem categoria') as categoria,
        COALESCE(cat.emoji, '📦') as emoji,
        COUNT(*) as total
      FROM ocorrencias o
      LEFT JOIN categorias cat ON cat.id = o.categoria_id
      WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
      GROUP BY cat.nome, o.categoria_texto, cat.emoji
      ORDER BY total DESC
      LIMIT 8
    `,
    // Ocorrências por loja
    sql`
      SELECT 
        COALESCE(l.nome, 'Sem loja') as loja,
        COUNT(*) as total
      FROM ocorrencias o
      LEFT JOIN condominios c ON c.id = o.condominio_id
      LEFT JOIN lojas l ON l.id = c.loja_id
      WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
      GROUP BY l.nome
      ORDER BY total DESC
    `,
    // Total de limpezas
    sql`
      SELECT COUNT(*) as total
      FROM limpezas
      WHERE ts_checkin >= ${inicio} AND ts_checkin <= ${fim}
    `,
    // Tempo médio de resolução (em horas)
    sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (e.criado_em - o.criado_em)) / 3600)::numeric, 1) as horas
      FROM ocorrencias o
      JOIN ocorrencia_estados e ON e.ocorrencia_id = o.id
      WHERE e.estado_novo = 'resolvida'
        AND o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
    `
  ])

  return c.json({
    periodo: { inicio, fim },
    por_estado,
    por_categoria,
    por_loja,
    total_limpezas: Number(limpezas[0]?.total || 0),
    tempo_medio_horas: tempo_medio[0]?.horas || null
  })
})

// ── Rotas públicas (sem autenticação) ─────────────────────────

app.post('/public/ocorrencias', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  
  const formData = await c.req.formData()
    // Log temporário
  console.log('condominio recebido:', formData.get('condominio'))
  console.log('ocId recebido:', formData.get('ocId'))
  const ocId        = formData.get('ocId') || ''
  const condominioNImpar = formData.get('condominio') || ''
  const timestamp   = formData.get('timestamp') || ''
  const latitude    = formData.get('latitude') || null
  const longitude   = formData.get('longitude') || null
  const temFoto     = formData.get('temFoto') === 'true'
  const fotoUrl     = formData.get('photoBase64') ? null : null // foto vai para Drive, não aqui
  const categoria   = formData.get('categoria') || null
  const descricaoAI = formData.get('descricaoAI') || null
  const descricaoFinal = formData.get('descricaoFinal') || null
  const nome        = formData.get('nome') || null
  const telefone    = formData.get('telefone') || null
  const email       = formData.get('email') || null

  // Lookup condominio_id a partir do n_impar
  const cond = await sql`
    SELECT id FROM condominios WHERE n_impar = ${condominioNImpar} LIMIT 1
  `
  if (cond.length === 0) {
    return c.json({ error: 'Condomínio não encontrado' }, 404)
  }
  const condominioId = cond[0].id

  // Lookup categoria
  const cat = await sql`
    SELECT id FROM categorias WHERE nome = ${categoria} LIMIT 1
  `
  const categoriaId = cat.length > 0 ? cat[0].id : null

  await sql`
    INSERT INTO ocorrencias (
      id, condominio_id, categoria_id, categoria_texto,
      descricao_ai, descricao_final,
      latitude, longitude,
      tem_foto,
      nome_reportante, telefone_reportante, email_reportante,
      status, ts_registo
    ) VALUES (
      ${ocId}, ${condominioId}, ${categoriaId}, ${categoria},
      ${descricaoAI}, ${descricaoFinal},
      ${latitude ? parseFloat(latitude) : null},
      ${longitude ? parseFloat(longitude) : null},
      ${temFoto},
      ${nome}, ${telefone}, ${email},
      'aberta',
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `

  return c.json({ ok: true })
})

app.post('/public/limpezas', async (c) => {
  const sql = neon(c.env.DATABASE_URL)

  const formData = await c.req.formData()
  const condominioNImpar = formData.get('condominio') || ''
  const latitude  = formData.get('latitude') || null
  const longitude = formData.get('longitude') || null
  const accuracy  = formData.get('accuracy') || null
  const temFoto   = formData.get('temFoto') === 'true'
  const timestamp = formData.get('timestamp') || null

  // Lookup condominio_id a partir do n_impar
  const cond = await sql`
    SELECT id, loja_id FROM condominios WHERE n_impar = ${condominioNImpar} LIMIT 1
  `
  if (cond.length === 0) {
    return c.json({ error: 'Condomínio não encontrado' }, 404)
  }

  await sql`
    INSERT INTO limpezas (
      condominio_id, loja_id,
      latitude, longitude, precisao_m,
      tem_foto, pin_validado,
      ts_checkin
    ) VALUES (
      ${cond[0].id}, ${cond[0].loja_id},
      ${latitude ? parseFloat(latitude) : null},
      ${longitude ? parseFloat(longitude) : null},
      ${accuracy ? parseFloat(accuracy) : null},
      ${temFoto}, true,
      NOW()
    )
  `

  return c.json({ ok: true })
})

// ── Prestadores ───────────────────────────────────────────────

app.get('/prestadores', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { nome, nif } = c.req.query()

  const rows = await sql`
    SELECT id, nif, nome, natureza, estado, cidade, email, telefone, website
    FROM prestadores
    WHERE ativo = true
      ${nome ? sql`AND nome ILIKE ${'%' + nome + '%'}` : sql``}
      ${nif ? sql`AND nif = ${nif}` : sql``}
    ORDER BY nome ASC
    LIMIT 100
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
    JOIN condominios c ON c.id = o.condominio_id
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

export default app