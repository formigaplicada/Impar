import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth, generateSessionToken } from '../lib/auth.js'
import { getMicrosoftToken } from '../lib/microsoft.js'

const ocorrencias = new Hono()

// ── GET /ocorrencias ──────────────────────────────────────────────────────────

ocorrencias.get('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const { n_impar, status, data_inicio, data_fim } = c.req.query()

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /ocorrencias/:id ──────────────────────────────────────────────────────

ocorrencias.get('/:id', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── PUT /ocorrencias/:id/status ───────────────────────────────────────────────

ocorrencias.put('/:id/status', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')
  const user = c.get('user')
  const body = await c.req.json()
  const { status, notas } = body

  const estados_validos = ['aberta', 'em_curso', 'resolvida', 'cancelada']
  if (!estados_validos.includes(status)) {
    return c.json({ error: 'Estado inválido' }, 400)
  }

  try {
    const atual = await sql`
      SELECT status, email_reportante, nome_reportante, id as oc_id
      FROM ocorrencias WHERE id = ${id}
    `
    if (atual.length === 0) return c.json({ error: 'Ocorrência não encontrada' }, 404)

    const estado_anterior = atual[0].status

    await sql`
      UPDATE ocorrencias SET status = ${status}, atualizado_em = NOW()
      WHERE id = ${id}
    `

    await sql`
      INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, utilizador_id, notas)
      VALUES (${id}, ${estado_anterior}, ${status}, ${user.id}, ${notas || null})
    `

    const email = atual[0].email_reportante
    if (email && status === 'resolvida') {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /ocorrencias/:id/prestador ──────────────────────────────────────────

ocorrencias.post('/:id/prestador', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const ocorrencia_id = c.req.param('id')
  const user = c.get('user')
  const body = await c.req.json()
  const { prestador_id, contacto_id, notas } = body

  try {
    const token_acesso = generateSessionToken()
    const token_expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await sql`
      INSERT INTO ocorrencia_prestadores (ocorrencia_id, prestador_id, contacto_id, utilizador_id, notas, token_acesso, token_expira)
      VALUES (${ocorrencia_id}, ${prestador_id}, ${contacto_id || null}, ${user.id}, ${notas || null}, ${token_acesso}, ${token_expira.toISOString()})
    `

    const estado_anterior = await sql`SELECT status FROM ocorrencias WHERE id = ${ocorrencia_id}`
    await sql`UPDATE ocorrencias SET status = 'em_curso', atualizado_em = NOW() WHERE id = ${ocorrencia_id}`
    await sql`
      INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, utilizador_id, notas)
      VALUES (${ocorrencia_id}, ${estado_anterior[0].status}, 'em_curso', ${user.id}, ${'Prestador atribuído'})
    `

    const contacto  = contacto_id ? await sql`SELECT email, nome FROM prestador_contactos WHERE id = ${contacto_id}` : []
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /ocorrencias/:id/prestadores-sugeridos ────────────────────────────────

ocorrencias.get('/:id/prestadores-sugeridos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const ocorrencia_id = c.req.param('id')

  try {
    const oc = await sql`
      SELECT o.condominio_id, c.loja_id
      FROM ocorrencias o
      JOIN condominios c ON c.n_impar = o.condominio_id
      WHERE o.id = ${ocorrencia_id}
    `
    if (oc.length === 0) return c.json({ sugestoes: [] })

    const { condominio_id, loja_id } = oc[0]

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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /limpezas ─────────────────────────────────────────────────────────────

ocorrencias.get('/limpezas', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const { n_impar, data_inicio, data_fim } = c.req.query()

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /intervencao/:token (público) ─────────────────────────────────────────

ocorrencias.get('/intervencao/:token', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /intervencao/:token (público) ────────────────────────────────────────

ocorrencias.post('/intervencao/:token', async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const token = c.req.param('token')

  try {
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

    await sql`UPDATE ocorrencias SET status = 'resolvida', atualizado_em = NOW() WHERE id = ${ocorrencia_id}`
    await sql`
      INSERT INTO ocorrencia_estados (ocorrencia_id, estado_anterior, estado_novo, notas)
      VALUES (${ocorrencia_id}, 'em_curso', 'resolvida', 'Intervenção registada pelo prestador')
    `

    const oc = await sql`SELECT email_reportante, nome_reportante FROM ocorrencias WHERE id = ${ocorrencia_id}`
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default ocorrencias
