import { cors } from 'hono/cors'
import { neon } from '@neondatabase/serverless'

// ── CORS (hono/cors) ──────────────────────────────────────────────────────────

export const corsMiddleware = cors({
  origin: ['https://app.condexpress.com', 'https://my.condexpress.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
})

// ── CORS manual (credentials + origens extra) ─────────────────────────────────

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://condexpress.pages.dev',
  'https://app.condexpress.com',
  'https://my.condexpress.com',
  'https://impar.formigaplicada.work',
  'https://jovial-otter-0ad2b9.netlify.app',
]

export async function corsManualMiddleware(c, next) {
  const origin = c.req.header('Origin') || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  if (c.req.method === 'OPTIONS') return c.text('', 204)
  await next()
}

// ── Session token ─────────────────────────────────────────────────────────────

export function generateSessionToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── requireAuth middleware ────────────────────────────────────────────────────

export async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return c.json({ error: 'Não autorizado' }, 401)

  const sql = neon(c.env.DATABASE_URL)
  const rows = await sql`
    SELECT u.id, u.nome, u.email, u.role, u.loja_id, s.impersonator_id
    FROM sessoes s
    JOIN utilizadores u ON u.id = s.utilizador_id
    WHERE s.token = ${token} AND s.expira_em > NOW()
  `
  if (rows.length === 0) return c.json({ error: 'Sessão inválida ou expirada' }, 401)
  c.set('user', rows[0])
  await next()
}
