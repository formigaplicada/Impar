import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { requireAuth } from '../lib/auth.js'
import { getMicrosoftToken } from '../lib/microsoft.js'

const condominios = new Hono()

// ── GET /condominios ──────────────────────────────────────────────────────────

condominios.get('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const user = c.get('user')
  const { n_impar, nome, loja_id } = c.req.query()

  try {
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
        ${loja_id ? sql`AND c.loja_id = ${parseInt(loja_id)}` : sql``}
      ORDER BY c.n_impar ASC
      LIMIT 100
    `
    return c.json({ condominios: rows })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /condominios ─────────────────────────────────────────────────────────

condominios.post('/', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const body = await c.req.json()
  const { loja_id, nome, nipc, morada, codigo_postal, telefone, telemovel, n_fracoes, iban, gestor, email_gestor, telefone2 } = body

  if (!loja_id || !nome) {
    return c.json({ error: 'Loja e Nome são obrigatórios' }, 400)
  }

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /condominios/:id/documentos ──────────────────────────────────────────

condominios.get('/:id/documentos', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id = c.req.param('id')
  const { folder_id } = c.req.query()

  try {
    const cond = await sql`
      SELECT id, n_impar, nome, onedrive_folder_id
      FROM condominios
      WHERE id = ${id}
    `
    if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

    const onedrive_folder_id = cond[0].onedrive_folder_id
    if (!onedrive_folder_id) return c.json({ available: false, items: [] })

    const targetFolderId = folder_id || onedrive_folder_id
    const token = await getMicrosoftToken(c.env)

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${targetFolderId}/children?$orderby=name asc&$select=id,name,size,lastModifiedDateTime,webUrl,folder,file`,
      { headers: { Authorization: `Bearer ${token}` } }
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

    const folders = items.filter(i => i.type === 'folder')
    const files   = items.filter(i => i.type === 'file')

    return c.json({
      available: true,
      folder_id: targetFolderId,
      root_folder_id: onedrive_folder_id,
      items: [...folders, ...files]
    })
  } catch (e) {
    return c.json({ available: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /condominios/:id/documentos/pasta ────────────────────────────────────

condominios.post('/:id/documentos/pasta', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('id')
  const body = await c.req.json()
  const { folder_id, name } = body

  if (!name || !name.trim()) return c.json({ error: 'Nome da pasta é obrigatório' }, 400)

  try {
    const cond = await sql`
      SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}
    `
    if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

    const onedrive_folder_id = cond[0].onedrive_folder_id
    if (!onedrive_folder_id) return c.json({ error: 'Pasta OneDrive não configurada' }, 400)

    const parentId = folder_id || onedrive_folder_id
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
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── POST /condominios/:id/documentos/upload ───────────────────────────────────

condominios.post('/:id/documentos/upload', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const condominioId = c.req.param('id')

  try {
    const cond = await sql`
      SELECT onedrive_folder_id FROM condominios WHERE id = ${condominioId}
    `
    if (cond.length === 0) return c.json({ error: 'Condomínio não encontrado' }, 404)

    const onedrive_folder_id = cond[0].onedrive_folder_id
    if (!onedrive_folder_id) return c.json({ error: 'Pasta OneDrive não configurada' }, 400)

    let formData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Erro ao processar form-data' }, 400)
    }

    const folder_id = formData.get('folder_id') || onedrive_folder_id
    const files = formData.getAll('files')

    let relativePaths = []
    try {
      const raw = formData.get('relative_paths')
      if (raw) relativePaths = JSON.parse(raw)
    } catch { /* sem caminhos relativos */ }

    if (!files || files.length === 0) return c.json({ error: 'Nenhum ficheiro enviado' }, 400)

    const token = await getMicrosoftToken(c.env)
    const GRAPH_USER = 'vitor.lopes@impar.pt'
    const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024

    const folderCache = {}

    async function ensureFolder(parentId, folderName) {
      const cacheKey = `${parentId}/${folderName}`
      if (folderCache[cacheKey]) return folderCache[cacheKey]

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

    async function resolveParent(relativePath) {
      if (!relativePath) return folder_id
      const parts = relativePath.split('/')
      const dirs = parts.slice(0, -1)
      if (dirs.length === 0) return folder_id
      let currentId = folder_id
      for (const dir of dirs) {
        if (!dir) continue
        currentId = await ensureFolder(currentId, dir)
      }
      return currentId
    }

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

    async function uploadLarge(parentId, fileName, buffer) {
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
      } catch (e) {
        errors.push({ name: fileName, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return c.json({ ok: true, items: results, errors })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

// ── GET /condominios/:id/financeiro ───────────────────────────────────────────

condominios.get('/:id/financeiro', requireAuth, async (c) => {
  const sql = neon(c.env.DATABASE_URL)
  const id  = c.req.param('id')

  try {
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

export default condominios
