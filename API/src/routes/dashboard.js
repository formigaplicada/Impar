import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'

const dashboard = new Hono()

// ── GET /dashboard ────────────────────────────────────────────────────────────

dashboard.get('/', requireAuth, async (c) => {
  const sql  = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const { data_inicio, data_fim } = c.req.query()

  const inicio     = data_inicio || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fim        = data_fim    || new Date().toISOString()
  const lojaFilter = user.role !== 'admin' && user.loja_id ? user.loja_id : null

  try {
    const [
      por_estado, por_categoria, por_loja, limpezas, tempo_medio,
      propostas_por_loja, condominios_por_loja,
      leads_por_loja_origem, leads_por_campanha,
      propostas_estados_loja, prestadores_resumo
    ] = await Promise.all([
      sql`
        SELECT o.status, COUNT(*) as total FROM ocorrencias o
        LEFT JOIN condominios c ON c.n_impar = o.condominio_id
        WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
          ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
        GROUP BY o.status ORDER BY o.status
      `,
      sql`
        SELECT COALESCE(cat.nome, o.categoria_texto, 'Sem categoria') as categoria,
               COALESCE(cat.emoji, '📦') as emoji, COUNT(*) as total
        FROM ocorrencias o
        LEFT JOIN categorias cat ON cat.id = o.categoria_id
        LEFT JOIN condominios c ON c.n_impar = o.condominio_id
        WHERE o.criado_em >= ${inicio} AND o.criado_em <= ${fim}
          ${lojaFilter ? sql`AND c.loja_id = ${lojaFilter}` : sql``}
        GROUP BY cat.nome, o.categoria_texto, cat.emoji ORDER BY total DESC LIMIT 8
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
        SELECT COUNT(*) as total FROM limpezas l
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
               COUNT(*) as count, COALESCE(SUM(p.total_sem_iva), 0) as total_sem_iva
        FROM propostas p LEFT JOIN lojas l ON l.id = p.loja_id
        WHERE p.data_envio >= ${inicio} AND p.data_envio <= ${fim}
          ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
        GROUP BY l.nome ORDER BY count DESC
      `,
      sql`
        SELECT COALESCE(l.nome, 'Sem loja') as loja,
               COUNT(*) FILTER (WHERE c.ativo = true) as total,
               COUNT(*) FILTER (WHERE c.ativo = true AND c.criado_em >= ${inicio} AND c.criado_em <= ${fim}) as novos
        FROM lojas l LEFT JOIN condominios c ON c.loja_id = l.id
        WHERE l.ativo = true ${lojaFilter ? sql`AND l.id = ${lojaFilter}` : sql``}
        GROUP BY l.nome ORDER BY l.nome ASC
      `,
      sql`
        SELECT COALESCE(l.nome, 'Sem loja') AS loja,
               CASE
                 WHEN p.utm_medium = 'cpc'                                 THEN 'ads'
                 WHEN p.utm_source = 'google' AND p.utm_medium = 'organic' THEN 'organico'
                 WHEN p.utm_source = '(direct)' OR p.utm_source IS NULL    THEN 'direto'
                 ELSE 'outros'
               END AS origem,
               COUNT(*) AS total, COALESCE(SUM(p.total_sem_iva), 0) AS valor
        FROM propostas p LEFT JOIN lojas l ON l.id = p.loja_id
        WHERE p.criado_em >= ${inicio} AND p.criado_em <= ${fim}
          ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
        GROUP BY l.nome, origem ORDER BY l.nome ASC, origem ASC
      `,
      sql`
        SELECT COALESCE(p.utm_campaign, '(não definido)') AS campanha,
               COALESCE(l.nome, 'Sem loja') AS loja,
               COUNT(*) AS total, COALESCE(SUM(p.total_sem_iva), 0) AS valor
        FROM propostas p LEFT JOIN lojas l ON l.id = p.loja_id
        WHERE p.utm_medium = 'cpc'
          AND p.criado_em >= ${inicio} AND p.criado_em <= ${fim}
          ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
        GROUP BY p.utm_campaign, l.nome ORDER BY total DESC, campanha ASC
      `,
      sql`
        SELECT COALESCE(l.nome, 'Sem loja') AS loja,
               CASE WHEN p.estado IN ('duvida', 'pedido_reuniao') THEN 'em_analise' ELSE p.estado END AS estado_agrupado,
               COUNT(*) AS total, COALESCE(SUM(p.total_sem_iva), 0) AS valor
        FROM propostas p LEFT JOIN lojas l ON l.id = p.loja_id
        WHERE p.estado IN ('enviada', 'recebida', 'duvida', 'pedido_reuniao', 'adjudicada', 'ativa')
          ${lojaFilter ? sql`AND p.loja_id = ${lojaFilter}` : sql``}
        GROUP BY l.nome, estado_agrupado ORDER BY l.nome ASC, estado_agrupado ASC
      `,
      sql`
        SELECT COUNT(*) FILTER (WHERE ativo = true) as total,
               COUNT(*) FILTER (WHERE ativo = true AND criado_em >= ${inicio} AND criado_em <= ${fim}) as novos
        FROM prestadores
      `,
    ])

    return c.json({
      periodo: { inicio, fim },
      por_estado, por_categoria, por_loja,
      total_limpezas:        Number(limpezas[0]?.total || 0),
      tempo_medio_horas:     tempo_medio[0]?.horas || null,
      propostas_por_loja,    condominios_por_loja,
      leads_por_loja_origem, leads_por_campanha,
      propostas_estados_loja,
      prestadores_resumo:    prestadores_resumo[0] || { total: 0, novos: 0 }
    })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default dashboard
