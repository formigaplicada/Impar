import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'

const admin = new Hono()

// ── Listar utilizadores ───────────────────────────────────────

admin.get('/users', requireAuth, requireRole('admin'), async (c) => {
  try {
    const sql = neon(c.env.DATABASE_URL)
    const rows = await sql`
      SELECT
        u.id,
        u.nome,
        u.email,
        u.role,
        u.ativo,
        u.telemovel,
        u.pin,
        u.ultimo_login,
        u.criado_em,
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', l.id, 'nome', l.nome)) FILTER (WHERE l.id IS NOT NULL),
          '[]'
        ) AS lojas,
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', c.id, 'nome', c.nome)) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS condominios
      FROM utilizadores u
      LEFT JOIN utilizador_lojas ul ON ul.utilizador_id = u.id
      LEFT JOIN lojas l ON l.id = ul.loja_id
      LEFT JOIN utilizador_condominios uc ON uc.utilizador_id = u.id
      LEFT JOIN condominios c ON c.id = uc.condominio_id
      GROUP BY u.id
      ORDER BY u.nome
    `
    return c.json(rows)
  } catch (err) {
    return c.json({ error: 'Erro ao listar utilizadores', detail: err.message }, 500)
  }
})

// ── Criar utilizador ──────────────────────────────────────────

admin.post('/users', requireAuth, requireRole('admin'), async (c) => {
  try {
    const { nome, email, role, telemovel, pin } = await c.req.json()

    if (!nome || !email || !role) {
      return c.json({ error: 'nome, email e role são obrigatórios' }, 400)
    }
    if (!email.endsWith('@impar.pt')) {
      return c.json({ error: 'Email deve ser @impar.pt' }, 400)
    }

    const sql = neon(c.env.DATABASE_URL)

    const existente = await sql`SELECT id FROM utilizadores WHERE email = ${email}`
    if (existente.length > 0) {
      return c.json({ error: 'Já existe um utilizador com este email' }, 409)
    }

    const rows = await sql`
      INSERT INTO utilizadores (nome, email, email_verificado, role, telemovel, pin)
      VALUES (${nome}, ${email}, false, ${role}, ${telemovel || null}, ${pin || null})
      RETURNING id, nome, email, role, ativo, telemovel, pin, criado_em
    `
    return c.json(rows[0], 201)
  } catch (err) {
    return c.json({ error: 'Erro ao criar utilizador', detail: err.message }, 500)
  }
})

// ── Editar utilizador ─────────────────────────────────────────

admin.put('/users/:id', requireAuth, requireRole('admin'), async (c) => {
  try {
    const { id } = c.req.param()
    const { nome, email, role, telemovel, pin, ativo } = await c.req.json()

    const sql = neon(c.env.DATABASE_URL)

    const existente = await sql`SELECT id FROM utilizadores WHERE id = ${id}`
    if (existente.length === 0) {
      return c.json({ error: 'Utilizador não encontrado' }, 404)
    }

    const rows = await sql`
      UPDATE utilizadores SET
        nome        = COALESCE(${nome || null}, nome),
        email       = COALESCE(${email || null}, email),
        role        = COALESCE(${role || null}, role),
        telemovel   = ${telemovel !== undefined ? telemovel || null : null},
        pin         = ${pin !== undefined ? pin || null : null},
        ativo       = COALESCE(${ativo !== undefined ? ativo : null}, ativo),
        atualizado_em = NOW()
      WHERE id = ${id}
      RETURNING id, nome, email, role, ativo, telemovel, pin, atualizado_em
    `
    return c.json(rows[0])
  } catch (err) {
    return c.json({ error: 'Erro ao editar utilizador', detail: err.message }, 500)
  }
})

// ── Desativar utilizador (soft delete) ────────────────────────

admin.delete('/users/:id', requireAuth, requireRole('admin'), async (c) => {
  try {
    const { id } = c.req.param()
    const currentUser = c.get('user')

    if (id === currentUser.id) {
      return c.json({ error: 'Não podes desativar a tua própria conta' }, 400)
    }

    const sql = neon(c.env.DATABASE_URL)

    const existente = await sql`SELECT id FROM utilizadores WHERE id = ${id}`
    if (existente.length === 0) {
      return c.json({ error: 'Utilizador não encontrado' }, 404)
    }

    await sql`
      UPDATE utilizadores SET ativo = false, atualizado_em = NOW()
      WHERE id = ${id}
    `
    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: 'Erro ao desativar utilizador', detail: err.message }, 500)
  }
})

// ── Substituir lojas de um utilizador ────────────────────────

admin.put('/users/:id/lojas', requireAuth, requireRole('admin'), async (c) => {
  try {
    const { id } = c.req.param()
    const { lojas } = await c.req.json() // array de loja_id (int)

    if (!Array.isArray(lojas)) {
      return c.json({ error: 'lojas deve ser um array' }, 400)
    }

    const sql = neon(c.env.DATABASE_URL)

    const existente = await sql`SELECT id FROM utilizadores WHERE id = ${id}`
    if (existente.length === 0) {
      return c.json({ error: 'Utilizador não encontrado' }, 404)
    }

    await sql`DELETE FROM utilizador_lojas WHERE utilizador_id = ${id}`

    if (lojas.length > 0) {
      await sql`
        INSERT INTO utilizador_lojas (utilizador_id, loja_id)
        SELECT ${id}, UNNEST(${lojas}::int[])
        ON CONFLICT DO NOTHING
      `
    }

    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: 'Erro ao atualizar lojas', detail: err.message }, 500)
  }
})

// ── Substituir condomínios de um utilizador ───────────────────

admin.put('/users/:id/condominios', requireAuth, requireRole('admin'), async (c) => {
  try {
    const { id } = c.req.param()
    const { condominios } = await c.req.json() // array de condominio_id (text)

    if (!Array.isArray(condominios)) {
      return c.json({ error: 'condominios deve ser um array' }, 400)
    }

    const sql = neon(c.env.DATABASE_URL)

    const existente = await sql`SELECT id FROM utilizadores WHERE id = ${id}`
    if (existente.length === 0) {
      return c.json({ error: 'Utilizador não encontrado' }, 404)
    }

    await sql`DELETE FROM utilizador_condominios WHERE utilizador_id = ${id}`

    if (condominios.length > 0) {
      await sql`
        INSERT INTO utilizador_condominios (utilizador_id, condominio_id)
        SELECT ${id}, UNNEST(${condominios}::text[])
        ON CONFLICT DO NOTHING
      `
    }

    return c.json({ ok: true })
  } catch (err) {
    return c.json({ error: 'Erro ao atualizar condomínios', detail: err.message }, 500)
  }
})

// ── Helpers ───────────────────────────────────────────────────

function requireAuth(c, next) {
  // Este middleware é injetado pelo index.js — aqui serve de placeholder
  // para quando as rotas forem registadas com app.use('/admin/*', requireAuth)
  return next()
}

function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get('user')
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Sem permissão' }, 403)
    }
    await next()
  }
}

export default admin
