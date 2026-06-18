import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'

const propostas = new Hono()

// ── POST /public/propostas/sync (público) ─────────────────────────────────────

propostas.post('/public/sync', async (c) => {
  const sql = neon(c.env.DATABASE_URL)

  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Payload JSON inválido' }, 400)
  }

  const {
    codigo, loja_nome, data_proposta, nome, telefone, email,
    localidade, morada, n_porta, codigo_postal, n_fracoes,
    limpeza, jardinagem, comentarios,
    preco_gestao, preco_limpeza, preco_jardinagem, total_sem_iva,
    outros_servicos, preco_outros,
    link_gm, link_street_view, link_pdf, data_envio,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, pagina_origem
  } = body

  if (!codigo || !nome) return c.json({ error: 'codigo e nome são obrigatórios' }, 400)

  try {
    let loja_id = null
    if (loja_nome) {
      const lojaRes = await sql`
        SELECT id FROM lojas WHERE LOWER(nome_comercial) = LOWER(${loja_nome}) AND ativo = true LIMIT 1
      `
      loja_id = lojaRes.length > 0 ? lojaRes[0].id : null
    }

    await sql`
      INSERT INTO propostas (
        codigo, loja_id, loja_nome,
        data_proposta, nome, telefone, email,
        localidade, morada, n_porta, codigo_postal,
        n_fracoes, limpeza, jardinagem, comentarios,
        preco_gestao, preco_limpeza, preco_jardinagem, total_sem_iva,
        outros_servicos, preco_outros, estado,
        link_gm, link_street_view, link_pdf, data_envio,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, pagina_origem
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
        ${outros_servicos || null}, ${preco_outros ? parseFloat(preco_outros) : null},
        'enviada',
        ${link_gm || null}, ${link_street_view || null}, ${link_pdf || null},
        ${data_envio || null},
        ${utm_source || null}, ${utm_medium || null}, ${utm_campaign || null},
        ${utm_content || null}, ${utm_term || null}, ${pagina_origem || null}
      )
      ON CONFLICT (codigo) DO UPDATE SET
        loja_id           = EXCLUDED.loja_id,
        loja_nome         = EXCLUDED.loja_nome,
        link_pdf          = EXCLUDED.link_pdf,
        data_envio        = EXCLUDED.data_envio,
        preco_gestao      = EXCLUDED.preco_gestao,
        preco_limpeza     = EXCLUDED.preco_limpeza,
        preco_jardinagem  = EXCLUDED.preco_jardinagem,
        total_sem_iva     = EXCLUDED.total_sem_iva,
        outros_servicos   = EXCLUDED.outros_servicos,
        preco_outros      = EXCLUDED.preco_outros,
        link_gm           = EXCLUDED.link_gm,
        link_street_view  = EXCLUDED.link_street_view,
        utm_source        = EXCLUDED.utm_source,
        utm_medium        = EXCLUDED.utm_medium,
        utm_campaign      = EXCLUDED.utm_campaign,
        utm_content       = EXCLUDED.utm_content,
        utm_term          = EXCLUDED.utm_term,
        pagina_origem     = EXCLUDED.pagina_origem,
        atualizado_em     = now()
    `

    return c.json({ ok: true, codigo })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /public/propostas/:codigo/estado (público, API key) ──────────────────

propostas.post('/public/:codigo/estado', async (c) => {
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

  try {
    const atual = await sql`SELECT id, estado FROM propostas WHERE codigo = ${codigo}`
    if (atual.length === 0) return c.json({ error: 'Proposta não encontrada' }, 404)

    const proposta_id     = atual[0].id
    const estado_anterior = atual[0].estado

    await sql`UPDATE propostas SET estado = ${estado}, atualizado_em = NOW() WHERE id = ${proposta_id}`
    await sql`
      INSERT INTO proposta_estados (proposta_id, estado_anterior, estado_novo, notas, utilizador_id, origem)
      VALUES (${proposta_id}, ${estado_anterior}, ${estado}, ${notas || null}, NULL, 'power_automate')
    `

    return c.json({ ok: true, codigo, estado })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /propostas ────────────────────────────────────────────────────────────

propostas.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const { loja_id, estado, search } = c.req.query()

  try {
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
          p.nome       ILIKE ${'%' + search + '%'} OR
          p.email      ILIKE ${'%' + search + '%'} OR
          p.codigo     ILIKE ${'%' + search + '%'} OR
          p.localidade ILIKE ${'%' + search + '%'}
        )` : sql``}
      ORDER BY p.data_envio DESC NULLS LAST
      LIMIT 200
    `
    return c.json({ propostas: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /propostas/:id ────────────────────────────────────────────────────────

propostas.get('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  if (user.role !== 'admin') return c.json({ error: 'Acesso negado' }, 403)

  const sql = neon(c.env.DATABASE_URL)
  const id = parseInt(c.req.param('id'))

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── PUT /propostas/:id/estado ─────────────────────────────────────────────────

propostas.put('/:id/estado', requireAuth, async (c) => {
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

  try {
    const atual = await sql`SELECT estado FROM propostas WHERE id = ${parseInt(id)}`
    if (atual.length === 0) return c.json({ error: 'Proposta não encontrada' }, 404)

    const estado_anterior = atual[0].estado

    await sql`UPDATE propostas SET estado = ${estado}, atualizado_em = NOW() WHERE id = ${parseInt(id)}`
    await sql`
      INSERT INTO proposta_estados (proposta_id, estado_anterior, estado_novo, notas, utilizador_id, origem)
      VALUES (${parseInt(id)}, ${estado_anterior}, ${estado}, ${notas || null}, ${user.id}, 'backoffice')
    `

    return c.json({ ok: true, estado })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default propostas
