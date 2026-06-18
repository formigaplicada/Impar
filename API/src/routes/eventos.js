import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'

const eventos = new Hono()

const TIPOS         = ['reuniao']
const TIPOS_REUNIAO = ['ago', 'extraordinaria', 'apresentacao', 'assinaturas', 'outro']
const FORMATOS      = ['presencial', 'online', 'misto']
const ESTADOS       = ['agendada', 'realizada', 'adiada', 'cancelada']

// ── GET /eventos ──────────────────────────────────────────────────────────────

eventos.get('/', requireAuth, async (c) => {
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

  try {
    const rows = await sql`
      SELECT
        e.id, e.tipo, e.tipo_reuniao,
        e.condominio_id, e.condominio_texto,
        c.nome    AS condominio_nome,
        c.n_impar AS condominio_n_impar,
        e.localidade, e.loja_id,
        l.nome    AS loja_nome,
        e.filial_texto, e.data_hora, e.formato,
        e.local_evento, e.gestor, e.estado, e.comentarios,
        e.criado_em, e.atualizado_em,
        u.nome    AS criado_por_nome
      FROM eventos e
      LEFT JOIN condominios  c ON c.id = e.condominio_id
      LEFT JOIN lojas        l ON l.id = e.loja_id
      LEFT JOIN utilizadores u ON u.id = e.criado_por
      WHERE 1=1
        ${tipo          ? sql`AND e.tipo          = ${tipo}`                    : sql``}
        ${gestor        ? sql`AND e.gestor         ILIKE ${'%' + gestor + '%'}` : sql``}
        ${loja_id       ? sql`AND e.loja_id        = ${loja_id}`                : sql``}
        ${estado        ? sql`AND e.estado         = ${estado}`                 : sql``}
        ${condominio_id ? sql`AND e.condominio_id  = ${condominio_id}`          : sql``}
        ${mesInicio     ? sql`AND e.data_hora     >= ${mesInicio}::date`        : sql``}
        ${mesFim        ? sql`AND e.data_hora      < ${mesFim}::date`           : sql``}
      ORDER BY e.data_hora ASC
      LIMIT 500
    `
    return c.json({ eventos: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /eventos/gestores ─────────────────────────────────────────────────────

eventos.get('/gestores', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`
      SELECT id, nome FROM utilizadores WHERE ativo = true ORDER BY nome ASC
    `
    return c.json({ gestores: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /eventos/:id ──────────────────────────────────────────────────────────

eventos.get('/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /eventos ─────────────────────────────────────────────────────────────

eventos.post('/', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const body = await c.req.json()

  const {
    tipo, tipo_reuniao,
    condominio_id, condominio_texto,
    localidade, loja_id, filial_texto,
    data_hora, formato, local_evento,
    gestor, gestor_id, estado, comentarios,
  } = body

  if (!data_hora) return c.json({ error: 'data_hora é obrigatória' }, 400)
  if (tipo         && !TIPOS.includes(tipo))                 return c.json({ error: 'tipo inválido' }, 400)
  if (tipo_reuniao && !TIPOS_REUNIAO.includes(tipo_reuniao)) return c.json({ error: 'tipo_reuniao inválido' }, 400)
  if (formato      && !FORMATOS.includes(formato))           return c.json({ error: 'formato inválido' }, 400)
  if (estado       && !ESTADOS.includes(estado))             return c.json({ error: 'estado inválido' }, 400)

  try {
    const rows = await sql`
      INSERT INTO eventos (
        tipo, tipo_reuniao,
        condominio_id, condominio_texto,
        localidade, loja_id, filial_texto,
        data_hora, formato, local_evento,
        gestor, gestor_id, estado, comentarios, criado_por
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
        ${estado           || 'agendada'},
        ${comentarios      || null},
        ${user.id}
      )
      RETURNING id
    `
    return c.json({ ok: true, id: rows[0].id }, 201)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── PUT /eventos/:id ──────────────────────────────────────────────────────────

eventos.put('/:id', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const id   = c.req.param('id')
  const body = await c.req.json()

  try {
    const existe = await sql`SELECT id FROM eventos WHERE id = ${id}`
    if (existe.length === 0) return c.json({ error: 'Evento não encontrado' }, 404)

    const {
      tipo, tipo_reuniao,
      condominio_id, condominio_texto,
      localidade, loja_id, filial_texto,
      data_hora, formato, local_evento,
      gestor, gestor_id, estado, comentarios,
    } = body

    await sql`
      UPDATE eventos SET
        tipo             = ${tipo             || 'reuniao'},
        tipo_reuniao     = ${tipo_reuniao     ?? null},
        condominio_id    = ${condominio_id    || null},
        condominio_texto = ${condominio_texto ?? null},
        localidade       = ${localidade       ?? null},
        loja_id          = ${loja_id          || null},
        filial_texto     = ${filial_texto     ?? null},
        data_hora        = ${data_hora},
        formato          = ${formato          || 'presencial'},
        local_evento     = ${local_evento     ?? null},
        gestor           = ${gestor           ?? null},
        gestor_id        = ${gestor_id        || null},
        estado           = ${estado           || 'agendada'},
        comentarios      = ${comentarios      ?? null}
      WHERE id = ${id}
    `
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── DELETE /eventos/:id ───────────────────────────────────────────────────────

eventos.delete('/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
    const existe = await sql`SELECT id FROM eventos WHERE id = ${id}`
    if (existe.length === 0) return c.json({ error: 'Evento não encontrado' }, 404)
    await sql`DELETE FROM eventos WHERE id = ${id}`
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /eventos/sincronizar-estados ─────────────────────────────────────────

eventos.post('/sincronizar-estados', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    await sql`
      UPDATE eventos SET estado = 'realizada'
      WHERE estado = 'agendada' AND data_hora < NOW()
    `
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /eventos/importar ────────────────────────────────────────────────────

eventos.post('/importar', requireAuth, async (c) => {
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
          ${e.estado       || 'agendada'},
          ${e.comentarios  || null},
          ${user.id}
        )
      `
      inseridos++
    } catch (err) {
      erros.push({ linha: e, motivo: err instanceof Error ? err.message : String(err) })
    }
  }

  return c.json({ ok: true, inseridos, erros })
})

export default eventos
