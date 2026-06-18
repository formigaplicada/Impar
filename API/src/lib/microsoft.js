import { neon } from '@neondatabase/serverless'

// ── Token Microsoft Graph ─────────────────────────────────────────────────────

export async function getMicrosoftToken(env) {
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

// ── Sync de um condomínio (match por n_impar / old_n_impar) ──────────────────

export async function syncCondominioOneDrive({ token, loja, condominio, pastaCache, sql }) {
  if (!loja?.onedrive_activos_folder_id) {
    return { ok: false, reason: 'no_activos_folder' }
  }

  let pastas = pastaCache.get(loja.id)
  if (!pastas) {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${loja.onedrive_activos_folder_id}/children?$top=500&$select=id,name,folder`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const err = await res.json()
        return { ok: false, reason: 'api_error', error: err?.error?.message || `HTTP ${res.status}` }
      }
      const data = await res.json()
      pastas = (data.value || []).filter(i => i.folder)
      pastaCache.set(loja.id, pastas)
    } catch (err) {
      return { ok: false, reason: 'api_error', error: err.message }
    }
  }

  function extractPrefix(name) {
    const match = name.match(/^(\d+)\s*-/)
    if (!match) return null
    return Number(match[1])
  }

  const nImpar    = Number(condominio.n_impar)
  const oldNImpar = condominio.old_n_impar != null ? Number(condominio.old_n_impar) : null

  let match = pastas.find(p => extractPrefix(p.name) === nImpar)
  if (!match && oldNImpar != null && !isNaN(oldNImpar)) {
    match = pastas.find(p => extractPrefix(p.name) === oldNImpar)
  }

  if (!match) return { ok: false, reason: 'not_found' }

  await sql`
    UPDATE condominios
    SET onedrive_folder_id = ${match.id}
    WHERE id = ${condominio.id}
  `

  return { ok: true, folder_id: match.id, folder_name: match.name }
}

// ── Sync de uma loja (batch insert/update) ────────────────────────────────────

export async function syncLojaOneDrive({ token, loja, sql }) {
  if (!loja.onedrive_activos_folder_id) {
    return { ok: false, reason: 'no_activos_folder' }
  }

  let pastas
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/vitor.lopes@impar.pt/drive/items/${loja.onedrive_activos_folder_id}/children?$top=500&$select=id,name,folder`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const err = await res.json()
      return { ok: false, reason: 'api_error', error: err?.error?.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    pastas = (data.value || []).filter(i => i.folder)
  } catch (err) {
    return { ok: false, reason: 'api_error', error: err.message }
  }

  if (pastas.length === 0) {
    return { ok: true, criados: 0, ligados: 0, ignorados: 0, detalhes: [] }
  }

  const jaMapados = await sql`
    SELECT onedrive_folder_id
    FROM condominios
    WHERE onedrive_folder_id IS NOT NULL AND ativo = true
  `
  const idsMapados = new Set(jaMapados.map(r => r.onedrive_folder_id))

  const existentes = await sql`
    SELECT id, n_impar, old_n_impar, onedrive_folder_id
    FROM condominios
    WHERE ativo = true
  `
  const porNImpar    = new Map()
  const porOldNImpar = new Map()
  for (const c of existentes) {
    porNImpar.set(Number(c.n_impar), c)
    if (c.old_n_impar != null) {
      porOldNImpar.set(Number(String(c.old_n_impar).trim()), c)
    }
  }

  function extractPrefix(name) {
    const match = name.match(/^(\d+)\s*-/)
    if (!match) return null
    if (match[1].length < 5) return null
    return Number(match[1])
  }

  function extractNome(name) {
    return name.replace(/^\d+\s*-\s*/, '').trim()
  }

  const detalhes  = []
  let ignorados   = 0
  const paraCriar = []
  const paraLigar = []

  for (const pasta of pastas) {
    const nImpar = extractPrefix(pasta.name)

    if (nImpar === null || isNaN(nImpar)) {
      ignorados++
      detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'sem prefixo numérico' })
      continue
    }

    if (idsMapados.has(pasta.id)) {
      ignorados++
      detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'já mapeado' })
      continue
    }

    const existente = porNImpar.get(nImpar) || porOldNImpar.get(nImpar)

    if (existente) {
      if (!existente.onedrive_folder_id) {
        paraLigar.push({ condId: existente.id, folderId: pasta.id, nImpar, pasta: pasta.name })
      } else {
        ignorados++
        detalhes.push({ pasta: pasta.name, resultado: 'ignorado', motivo: 'já mapeado' })
      }
    } else {
      const nome   = extractNome(pasta.name)
      const condId = String(nImpar)
      paraCriar.push({ condId, nImpar, nome, folderId: pasta.id, pasta: pasta.name })
    }
  }

  // Batch INSERT
  let criados = 0
  if (paraCriar.length > 0) {
    try {
      const ids       = paraCriar.map(r => r.condId)
      const nImpars   = paraCriar.map(r => r.nImpar)
      const lojaIds   = paraCriar.map(() => loja.id)
      const nomes     = paraCriar.map(r => r.nome)
      const folderIds = paraCriar.map(r => r.folderId)

      await sql`
        INSERT INTO condominios (id, n_impar, loja_id, nome, onedrive_folder_id)
        SELECT * FROM unnest(
          ${ids}::text[],
          ${nImpars}::int[],
          ${lojaIds}::int[],
          ${nomes}::text[],
          ${folderIds}::text[]
        ) AS t(id, n_impar, loja_id, nome, onedrive_folder_id)
        ON CONFLICT (id) DO NOTHING
      `
      criados = paraCriar.length
      for (const r of paraCriar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'criado', condominio_id: r.condId, nome: r.nome })
      }
    } catch (err) {
      for (const r of paraCriar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'erro', motivo: err.message })
      }
    }
  }

  // Batch UPDATE
  let ligados = 0
  if (paraLigar.length > 0) {
    try {
      const condIds   = paraLigar.map(r => r.condId)
      const folderIds = paraLigar.map(r => r.folderId)

      await sql`
        UPDATE condominios
        SET onedrive_folder_id = t.folder_id
        FROM unnest(
          ${condIds}::text[],
          ${folderIds}::text[]
        ) AS t(cond_id, folder_id)
        WHERE condominios.id = t.cond_id
      `
      ligados = paraLigar.length
      for (const r of paraLigar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'ligado', condominio_id: r.condId })
      }
    } catch (err) {
      for (const r of paraLigar) {
        detalhes.push({ pasta: r.pasta, n_impar: r.nImpar, resultado: 'erro', motivo: err.message })
      }
    }
  }

  return { ok: true, criados, ligados, ignorados, detalhes }
}

// ── Sync de todas as lojas ────────────────────────────────────────────────────

export async function syncTodasAsLojas(env, sql) {
  const lojas = await sql`
    SELECT id, nome, onedrive_activos_folder_id
    FROM lojas
    WHERE ativo = true AND onedrive_activos_folder_id IS NOT NULL
    ORDER BY nome ASC
  `

  if (lojas.length === 0) return { ok: true, lojas: [] }

  const token     = await getMicrosoftToken(env)
  const resultado = []

  for (const loja of lojas) {
    const res = await syncLojaOneDrive({ token, loja, sql })
    resultado.push({ loja_id: loja.id, loja_nome: loja.nome, ...res })
  }

  return { ok: true, lojas: resultado }
}
