import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'

const condominos = new Hono()

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseImportRow(row) {
  const cpRaw = (row.codigo_postal || '').trim()
  const cpMatch = cpRaw.match(/^(\d{4}-\d{3})\s+(.+)$/)
  const codigo_postal = cpMatch ? cpMatch[1] : cpRaw
  const localidade = cpMatch ? cpMatch[2] : ''

  const moradaRaw = (row.morada || '').trim()

  const nomeRaw = (row.nome || '').trim()
  let papel = 'proprietario'
  let nome = nomeRaw
  if (/arrendat[aá]rio/i.test(nomeRaw)) {
    papel = 'arrendatario'
    nome = nomeRaw.replace(/arrendat[aá]rio\s*/i, '').trim()
  }

  return {
    nome,
    nif: row.nif ? String(row.nif).trim() : null,
    email: row.email ? String(row.email).trim() : null,
    telefone: row.telefone ? String(row.telefone).trim() : null,
    telemovel: row.telemovel ? String(row.telemovel).trim() : null,
    morada: moradaRaw || null,
    codigo_postal: codigo_postal || null,
    localidade: localidade || null,
    pais: 'Portugal',
    fracao: (row.fracao || '').trim(),
    descricao_fracao: (row.descricao_fracao || row.andar_loja || '').trim() || null,
    estado: (row.estado || 'ativo').toLowerCase() === 'ativo' ? 'ativo' : 'inativo',
    papel,
  }
}

// ─── GET /condominos ─────────────────────────────────────────────────────────

condominos.get('/', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { nome, nif, estado } = c.req.query()

  try {
    const conditions = []
    const params = []
    let i = 1

    if (nome) {
      conditions.push(`c.nome ILIKE $${i++}`)
      params.push(`%${nome}%`)
    }
    if (nif) {
      conditions.push(`c.nif = $${i++}`)
      params.push(nif)
    }
    if (estado) {
      conditions.push(`EXISTS (
        SELECT 1 FROM condomino_fracoes cf
        WHERE cf.condomino_id = c.id AND cf.estado = $${i++}
      )`)
      params.push(estado)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await sql(
      `SELECT c.*
       FROM condominos c
       ${where}
       ORDER BY c.nome ASC`,
      params
    )

    return c.json(rows)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── GET /condominos/por-condominio/:condominioId ─────────────────────────────

condominos.get('/por-condominio/:condominioId', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { condominioId } = c.req.param()
  const { estado } = c.req.query()

  try {
    const params = [condominioId]
    let estadoClause = ''
    if (estado) {
      estadoClause = `AND cf.estado = $2`
      params.push(estado)
    }

    const rows = await sql(
      `SELECT
         c.id, c.nome, c.nif, c.email, c.telefone, c.telemovel,
         cf.id as fracao_id, cf.fracao, cf.descricao_fracao,
         cf.papel, cf.estado, cf.data_aquisicao, cf.data_venda,
         COALESCE(cf.morada_override, c.morada) as morada,
         COALESCE(cf.codigo_postal_override, c.codigo_postal) as codigo_postal,
         COALESCE(cf.localidade_override, c.localidade) as localidade,
         COALESCE(cf.pais_override, c.pais) as pais
       FROM condomino_fracoes cf
       JOIN condominos c ON c.id = cf.condomino_id
       WHERE cf.condominio_id = $1 ${estadoClause}
       ORDER BY cf.fracao ASC, cf.estado ASC`,
      params
    )
    return c.json(rows)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── GET /condominos/:id ──────────────────────────────────────────────────────

condominos.get('/:id', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()

  try {
    const [condomino] = await sql(
      `SELECT * FROM condominos WHERE id = $1`,
      [id]
    )

    if (!condomino) return c.json({ error: 'Não encontrado' }, 404)

    const fracoes = await sql(
      `SELECT cf.*, cd.nome as condominio_nome
       FROM condomino_fracoes cf
       JOIN condominios cd ON cd.id = cf.condominio_id
       WHERE cf.condomino_id = $1
       ORDER BY cf.estado ASC, cf.data_aquisicao DESC`,
      [id]
    )

    return c.json({ ...condomino, fracoes })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── POST /condominos ─────────────────────────────────────────────────────────

condominos.post('/', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()

  const {
    nome, nif, email, telefone, telemovel,
    morada, codigo_postal, localidade, pais,
  } = body

  if (!nome) return c.json({ error: 'nome é obrigatório' }, 400)

  try {
    const [row] = await sql(
      `INSERT INTO condominos
         (nome, nif, email, telefone, telemovel, morada, codigo_postal, localidade, pais)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [nome, nif ?? null, email ?? null, telefone ?? null, telemovel ?? null,
       morada ?? null, codigo_postal ?? null, localidade ?? null, pais ?? 'Portugal']
    )
    return c.json(row, 201)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── PUT /condominos/:id ──────────────────────────────────────────────────────

condominos.put('/:id', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()
  const body = await c.req.json()

  const {
    nome, nif, email, telefone, telemovel,
    morada, codigo_postal, localidade, pais,
  } = body

  try {
    const [row] = await sql(
      `UPDATE condominos SET
         nome            = COALESCE($1, nome),
         nif             = $2,
         email           = $3,
         telefone        = $4,
         telemovel       = $5,
         morada          = $6,
         codigo_postal   = $7,
         localidade      = $8,
         pais            = COALESCE($9, pais)
       WHERE id = $10
       RETURNING *`,
      [nome ?? null, nif ?? null, email ?? null, telefone ?? null, telemovel ?? null,
       morada ?? null, codigo_postal ?? null, localidade ?? null, pais ?? null, id]
    )

    if (!row) return c.json({ error: 'Não encontrado' }, 404)
    return c.json(row)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── DELETE /condominos/:id ───────────────────────────────────────────────────

condominos.delete('/:id', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()

  try {
    await sql(`DELETE FROM condominos WHERE id = $1`, [id])
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── GET /condominos/:id/fracoes ──────────────────────────────────────────────

condominos.get('/:id/fracoes', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()

  try {
    const rows = await sql(
      `SELECT cf.*, cd.nome as condominio_nome
       FROM condomino_fracoes cf
       JOIN condominios cd ON cd.id = cf.condominio_id
       WHERE cf.condomino_id = $1
       ORDER BY cf.estado ASC, cf.data_aquisicao DESC`,
      [id]
    )
    return c.json(rows)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── POST /condominos/:id/fracoes ─────────────────────────────────────────────

condominos.post('/:id/fracoes', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { id } = c.req.param()
  const body = await c.req.json()

  const {
    condominio_id, fracao, descricao_fracao, papel,
    estado, data_aquisicao, data_venda,
    morada_override, codigo_postal_override, localidade_override, pais_override,
  } = body

  if (!condominio_id || !fracao) {
    return c.json({ error: 'condominio_id e fracao são obrigatórios' }, 400)
  }

  try {
    const [row] = await sql(
      `INSERT INTO condomino_fracoes
         (condomino_id, condominio_id, fracao, descricao_fracao, papel,
          estado, data_aquisicao, data_venda,
          morada_override, codigo_postal_override, localidade_override, pais_override)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [id, condominio_id, fracao, descricao_fracao ?? null,
       papel ?? 'proprietario', estado ?? 'ativo',
       data_aquisicao ?? '1900-01-01', data_venda ?? null,
       morada_override ?? null, codigo_postal_override ?? null,
       localidade_override ?? null, pais_override ?? null]
    )
    return c.json(row, 201)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── PUT /condominos/:id/fracoes/:fracaoId ────────────────────────────────────

condominos.put('/:id/fracoes/:fracaoId', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { fracaoId } = c.req.param()
  const body = await c.req.json()

  const {
    fracao, descricao_fracao, papel, estado,
    data_aquisicao, data_venda,
    morada_override, codigo_postal_override, localidade_override, pais_override,
  } = body

  try {
    const [row] = await sql(
      `UPDATE condomino_fracoes SET
         fracao                  = COALESCE($1, fracao),
         descricao_fracao        = $2,
         papel                   = COALESCE($3, papel),
         estado                  = COALESCE($4, estado),
         data_aquisicao          = COALESCE($5, data_aquisicao),
         data_venda              = $6,
         morada_override         = $7,
         codigo_postal_override  = $8,
         localidade_override     = $9,
         pais_override           = $10
       WHERE id = $11
       RETURNING *`,
      [fracao ?? null, descricao_fracao ?? null, papel ?? null, estado ?? null,
       data_aquisicao ?? null, data_venda ?? null,
       morada_override ?? null, codigo_postal_override ?? null,
       localidade_override ?? null, pais_override ?? null,
       fracaoId]
    )

    if (!row) return c.json({ error: 'Não encontrado' }, 404)
    return c.json(row)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── DELETE /condominos/:id/fracoes/:fracaoId ─────────────────────────────────

condominos.delete('/:id/fracoes/:fracaoId', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { fracaoId } = c.req.param()

  try {
    await sql(`DELETE FROM condomino_fracoes WHERE id = $1`, [fracaoId])
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ─── POST /condominos/import ──────────────────────────────────────────────────

condominos.post('/import', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()

  const { condominio_id, rows } = body

  if (!condominio_id || !Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'condominio_id e rows são obrigatórios' }, 400)
  }

  const created = []
  const errors = []

  for (const raw of rows) {
    try {
      const parsed = parseImportRow(raw)

      if (!parsed.nome) {
        errors.push({ row: raw, error: 'nome em falta' })
        continue
      }

      const [condomino] = await sql(
        `INSERT INTO condominos
           (nome, nif, email, telefone, telemovel, morada, codigo_postal, localidade, pais)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [parsed.nome, parsed.nif, parsed.email, parsed.telefone, parsed.telemovel,
         parsed.morada, parsed.codigo_postal, parsed.localidade, parsed.pais]
      )

      const [fracao] = await sql(
        `INSERT INTO condomino_fracoes
           (condomino_id, condominio_id, fracao, descricao_fracao, papel,
            estado, data_aquisicao, data_venda)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [condomino.id, condominio_id, parsed.fracao, parsed.descricao_fracao,
         parsed.papel, parsed.estado, '1900-01-01', null]
      )

      created.push({ condomino, fracao })
    } catch (e) {
      errors.push({ row: raw, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return c.json({
    created: created.length,
    errors: errors.length,
    details: errors.length ? errors : undefined,
  }, errors.length && !created.length ? 500 : 201)
})

export default condominos
