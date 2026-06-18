import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'

const contratos = new Hono()

// ── GET /servicos ─────────────────────────────────────────────────────────────

contratos.get('/servicos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  try {
    const rows = await sql`SELECT * FROM servicos WHERE ativo = true ORDER BY categoria, nome`
    return c.json({ servicos: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /servicos ────────────────────────────────────────────────────────────

contratos.post('/servicos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { nome, em_contrato, em_prestador } = await c.req.json()
  if (!nome) return c.json({ error: 'nome é obrigatório' }, 400)

  try {
    const rows = await sql`
      INSERT INTO servicos (nome, em_contrato, em_prestador)
      VALUES (${nome}, ${em_contrato || false}, ${em_prestador || false})
      ON CONFLICT (nome) DO UPDATE SET em_prestador = EXCLUDED.em_prestador
      RETURNING id
    `
    return c.json({ ok: true, id: rows[0].id })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /contratos ────────────────────────────────────────────────────────────

contratos.get('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const { condominio_id, prestador_id, tipo, estado } = c.req.query()

  try {
    const lista = await sql`
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
    if (lista.length === 0) return c.json({ contratos: [] })

    const ids      = lista.map(c => c.id)
    const servicos = await sql`
      SELECT cs.id, cs.contrato_id, cs.servico_id, cs.nome_custom, cs.valor_mensal,
             cs.periodicidade, cs.estimativa, cs.observacoes,
             s.nome AS servico_nome, s.categoria
      FROM contrato_servicos cs JOIN servicos s ON s.id = cs.servico_id
      WHERE cs.contrato_id = ANY(${ids}) ORDER BY s.nome
    `
    const resultado = lista.map(c => ({ ...c, servicos: servicos.filter(s => s.contrato_id === c.id) }))
    return c.json({ contratos: resultado })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /contratos/:id ────────────────────────────────────────────────────────

contratos.get('/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
    const rows = await sql`
      SELECT c.*, p.nome AS prestador_nome FROM contratos c
      LEFT JOIN prestadores p ON p.id = c.prestador_id WHERE c.id = ${id}
    `
    if (rows.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)

    const servicos = await sql`
      SELECT cs.*, s.nome AS servico_nome, s.categoria FROM contrato_servicos cs
      JOIN servicos s ON s.id = cs.servico_id WHERE cs.contrato_id = ${id} ORDER BY s.nome
    `
    return c.json({ contrato: { ...rows[0], servicos } })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /contratos/:id/logs ───────────────────────────────────────────────────

contratos.get('/:id/logs', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
    const logs = await sql`
      SELECT cl.*, u.nome AS utilizador_nome FROM contrato_logs cl
      LEFT JOIN utilizadores u ON u.id = cl.utilizador_id
      WHERE cl.contrato_id = ${id} ORDER BY cl.criado_em DESC LIMIT 100
    `
    return c.json({ logs })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /contratos ───────────────────────────────────────────────────────────

contratos.post('/', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const body = await c.req.json()

  const {
    tipo, condominio_id, prestador_id,
    data_inicio, data_fim, estado,
    renovacao_automatica, documento_url, condicoes,
    servicos = [],
  } = body

  if (!data_inicio)   return c.json({ error: 'data_inicio é obrigatória' }, 400)
  if (!condominio_id) return c.json({ error: 'condominio_id é obrigatório' }, 400)

  const TIPOS   = ['condominio', 'prestador']
  const ESTADOS = ['ativo', 'suspenso', 'terminado']
  if (tipo   && !TIPOS.includes(tipo))     return c.json({ error: 'tipo inválido' }, 400)
  if (estado && !ESTADOS.includes(estado)) return c.json({ error: 'estado inválido' }, 400)

  try {
    const rows = await sql`
      INSERT INTO contratos (tipo, condominio_id, prestador_id, data_inicio, data_fim, estado, renovacao_automatica, documento_url, condicoes, criado_por)
      VALUES (${tipo || 'condominio'}, ${condominio_id}, ${prestador_id || null}, ${data_inicio}, ${data_fim || null},
              ${estado || 'ativo'}, ${renovacao_automatica || false}, ${documento_url || null}, ${condicoes || null}, ${user.id})
      RETURNING id
    `
    const contratoId = rows[0].id

    for (const s of servicos) {
      if (!s.servico_id) continue
      await sql`
        INSERT INTO contrato_servicos (contrato_id, servico_id, nome_custom, valor_mensal, periodicidade, estimativa, observacoes)
        VALUES (${contratoId}, ${s.servico_id || null}, ${s.nome_custom || null}, ${s.valor_mensal || null}, ${s.periodicidade || 'mensal'}, ${s.estimativa || false}, ${s.observacoes || null})
        ON CONFLICT (contrato_id, servico_id) WHERE servico_id IS NOT NULL DO UPDATE SET
          valor_mensal = EXCLUDED.valor_mensal, periodicidade = EXCLUDED.periodicidade,
          estimativa = EXCLUDED.estimativa, observacoes = EXCLUDED.observacoes
      `
    }

    if ((tipo || 'condominio') === 'prestador' && prestador_id) {
      const condInfo = await sql`SELECT loja_id FROM condominios WHERE id = ${condominio_id}`
      const lojaId   = condInfo[0]?.loja_id || null
      for (const s of servicos) {
        if (!s.servico_id) continue
        await sql`
          INSERT INTO prestador_servicos (prestador_id, servico_id, loja_id, contador)
          VALUES (${Number(prestador_id)}, ${s.servico_id}, ${lojaId}, 1)
          ON CONFLICT (prestador_id, servico_id, loja_id) DO UPDATE SET contador = prestador_servicos.contador + 1, atualizado_em = NOW()
        `
      }
    }

    await sql`
      INSERT INTO contrato_logs (contrato_id, utilizador_id, acao, detalhe)
      VALUES (${contratoId}, ${user.id}, 'contrato criado', ${JSON.stringify({ tipo, estado: estado || 'ativo' })}::jsonb)
    `

    return c.json({ ok: true, id: contratoId }, 201)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── PUT /contratos/:id ────────────────────────────────────────────────────────

contratos.put('/:id', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const id   = c.req.param('id')
  const body = await c.req.json()

  try {
    const antes = await sql`SELECT * FROM contratos WHERE id = ${id}`
    if (antes.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)

    const { tipo, prestador_id, data_inicio, data_fim, estado, renovacao_automatica, documento_url, condicoes, servicos = [] } = body

    await sql`
      UPDATE contratos SET
        tipo                 = ${tipo                || antes[0].tipo},
        prestador_id         = ${prestador_id        ?? null},
        data_inicio          = ${data_inicio         || antes[0].data_inicio},
        data_fim             = ${data_fim            || null},
        estado               = ${estado              || antes[0].estado},
        renovacao_automatica = ${renovacao_automatica ?? antes[0].renovacao_automatica},
        documento_url        = ${documento_url       || null},
        condicoes            = ${condicoes           || null}
      WHERE id = ${id}
    `

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
        ON CONFLICT (contrato_id, servico_id) WHERE servico_id IS NOT NULL DO UPDATE SET
          valor_mensal = EXCLUDED.valor_mensal, periodicidade = EXCLUDED.periodicidade,
          estimativa = EXCLUDED.estimativa, observacoes = EXCLUDED.observacoes
      `
    }

    const logs = []
    if (estado && estado !== antes[0].estado) logs.push({ acao: 'estado alterado', detalhe: { antes: antes[0].estado, depois: estado } })
    if (documento_url !== antes[0].documento_url) logs.push({ acao: 'documento actualizado', detalhe: {} })
    if (logs.length === 0) logs.push({ acao: 'contrato editado', detalhe: {} })

    for (const log of logs) {
      await sql`
        INSERT INTO contrato_logs (contrato_id, utilizador_id, acao, detalhe)
        VALUES (${id}, ${user.id}, ${log.acao}, ${JSON.stringify(log.detalhe)}::jsonb)
      `
    }

    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── DELETE /contratos/:id ─────────────────────────────────────────────────────

contratos.delete('/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
    const existe = await sql`SELECT id FROM contratos WHERE id = ${id}`
    if (existe.length === 0) return c.json({ error: 'Contrato não encontrado' }, 404)
    await sql`DELETE FROM contratos WHERE id = ${id}`
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /prestadores/:id/contratos ───────────────────────────────────────────

contratos.get('/prestador/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')
  const { data_inicio, data_fim } = c.req.query()

  try {
    const lista = await sql`
      SELECT c.id, c.estado, c.data_inicio, c.data_fim,
             cd.id AS condominio_id, cd.n_impar AS condominio_n_impar, cd.nome AS condominio_nome,
             cs.id AS contrato_servico_id, cs.periodicidade, s.nome AS servico_nome
      FROM contratos c
      JOIN condominios cd       ON cd.id = c.condominio_id
      JOIN contrato_servicos cs ON cs.contrato_id = c.id
      LEFT JOIN servicos s      ON s.id = cs.servico_id
      WHERE c.prestador_id = ${Number(id)} AND c.tipo = 'prestador'
      ORDER BY cd.nome ASC, s.nome ASC
    `

    let limpezasPorCondominio = {}
    if (data_inicio && data_fim && lista.length > 0) {
      const condominioIds = [...new Set(lista.map(r => r.condominio_id))]
      const limpezas = await sql`
        SELECT condominio_id, COUNT(*) AS total FROM limpezas
        WHERE condominio_id = ANY(${condominioIds})
          AND ts_checkin >= ${data_inicio} AND ts_checkin <= ${data_fim + 'T23:59:59Z'}
        GROUP BY condominio_id
      `
      for (const l of limpezas) limpezasPorCondominio[l.condominio_id] = Number(l.total)
    }

    return c.json({ contratos: lista.map(r => ({ ...r, limpezas_periodo: limpezasPorCondominio[r.condominio_id] ?? null })) })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default contratos
