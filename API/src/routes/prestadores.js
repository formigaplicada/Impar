import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'

const prestadores = new Hono()

// ── GET /prestadores ──────────────────────────────────────────────────────────

prestadores.get('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { nome, nif, loja_id, servico_id } = c.req.query()

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /prestadores ─────────────────────────────────────────────────────────

prestadores.post('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { nif, nome, natureza, capital, estado, data_inicio, cae, actividade,
          morada, cidade, codigo_postal, regiao, concelho, freguesia,
          email, telefone, website, iban } = body

  if (!nome) return c.json({ error: 'Nome é obrigatório' }, 400)

  try {
    const res = await sql`
      INSERT INTO prestadores (nif, nome, natureza, capital, estado, data_inicio, cae, actividade,
        morada, cidade, codigo_postal, regiao, concelho, freguesia, email, telefone, website, iban)
      VALUES (
        ${nif || null}, ${nome}, ${natureza || null}, ${capital || null},
        ${estado || 'active'}, ${data_inicio || null}, ${cae || null}, ${actividade || null},
        ${morada || null}, ${cidade || null}, ${codigo_postal || null}, ${regiao || null},
        ${concelho || null}, ${freguesia || null}, ${email || null}, ${telefone || null},
        ${website || null}, ${iban || null}
      )
      RETURNING id
    `
    return c.json({ ok: true, id: res[0].id })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /prestadores/por-servico/:servico_id ──────────────────────────────────

prestadores.get('/por-servico/:servico_id', requireAuth, async (c) => {
  const sql        = neon(c.env.DATABASE_URL)
  const servico_id = c.req.param('servico_id')
  const { loja_id } = c.req.query()

  try {
    const associados = await sql`
      SELECT p.id, p.nome, p.telefone, p.email, p.cidade, ps.contador
      FROM prestador_servicos ps
      JOIN prestadores p ON p.id = ps.prestador_id
      WHERE ps.servico_id = ${servico_id}
        AND ps.loja_id = ${Number(loja_id)}
        AND p.ativo = true
      ORDER BY ps.contador DESC, p.nome ASC
    `

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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /prestadores/:id/contactos ────────────────────────────────────────────

prestadores.get('/:id/contactos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')

  try {
    const rows = await sql`
      SELECT pc.id, pc.nome, pc.email, pc.telefone, pc.notas, pc.principal,
             l.nome as loja_nome, pc.condominio_id
      FROM prestador_contactos pc
      LEFT JOIN lojas l ON l.id = pc.loja_id
      WHERE pc.prestador_id = ${id} AND pc.ativo = true
      ORDER BY pc.principal DESC, pc.id ASC
    `
    return c.json({ contactos: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /prestadores/:id/contactos ──────────────────────────────────────────

prestadores.post('/:id/contactos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const prestador_id = c.req.param('id')
  const body = await c.req.json()
  const { nome, email, telefone, loja_id, condominio_id, notas, principal } = body

  try {
    const res = await sql`
      INSERT INTO prestador_contactos (prestador_id, nome, email, telefone, loja_id, condominio_id, notas, principal)
      VALUES (
        ${prestador_id}, ${nome || null}, ${email || null}, ${telefone || null},
        ${loja_id || null}, ${condominio_id || null}, ${notas || null}, ${principal || false}
      )
      RETURNING id
    `
    return c.json({ ok: true, id: res[0].id })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /nif/:nif ─────────────────────────────────────────────────────────────

prestadores.get('/nif/:nif', requireAuth, async (c) => {
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
    const cp  = r.pc4 && r.pc3 ? `${r.pc4}-${r.pc3}` : null
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
  } catch (e) {
    return c.json({ error: 'Erro ao consultar NIF: ' + (e instanceof Error ? e.message : String(e)) }, 500)
  }
})

// ── POST /prestador-servicos ──────────────────────────────────────────────────

prestadores.post('/servicos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { prestador_id, servico_id, loja_id } = await c.req.json()

  if (!prestador_id || !servico_id) return c.json({ error: 'prestador_id e servico_id são obrigatórios' }, 400)

  try {
    await sql`
      INSERT INTO prestador_servicos (prestador_id, servico_id, loja_id, contador)
      VALUES (${prestador_id}, ${servico_id}, ${loja_id || null}, 0)
      ON CONFLICT (prestador_id, servico_id, loja_id) DO NOTHING
    `
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default prestadores
