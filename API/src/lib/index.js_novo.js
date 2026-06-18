import { Hono } from 'hono'

// ── Lib ───────────────────────────────────────────────────────────────────────
import { corsMiddleware, corsManualMiddleware, requireAuth } from './lib/auth.js'

// ── Routers ───────────────────────────────────────────────────────────────────
import authRouter,    { healthHandler, meHandler } from './routes/auth.js'
import condominiosRouter                           from './routes/condominios.js'
import ocorrenciasRouter                           from './routes/ocorrencias.js'
import prestadoresRouter                           from './routes/prestadores.js'
import propostasRouter                             from './routes/propostas.js'
import eventosRouter                               from './routes/eventos.js'
import ddRouter                                    from './routes/dd.js'
import whatsappRouter, { enviarAlertasReunioes }   from './routes/whatsapp.js'
import contratosRouter                             from './routes/contratos.js'
import adminRouter                                 from './routes/admin.js'
import publicRouter                                from './routes/public.js'
import dashboardRouter                             from './routes/dashboard.js'
import aiRouter                                    from './routes/ai.js'
import condominosRouter                            from './routes/condominos.js'

// ── App ───────────────────────────────────────────────────────────────────────
const app = new Hono()

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use('*', corsMiddleware)
app.use('*', corsManualMiddleware)

// ── Routers com prefixo ───────────────────────────────────────────────────────
app.route('/auth',        authRouter)
app.route('/condominios', condominiosRouter)
app.route('/ocorrencias', ocorrenciasRouter)
app.route('/prestadores', prestadoresRouter)
app.route('/propostas',   propostasRouter)
app.route('/eventos',     eventosRouter)
app.route('/dd',          ddRouter)
app.route('/whatsapp',    whatsappRouter)
app.route('/contratos',   contratosRouter)
app.route('/admin',       adminRouter)
app.route('/dashboard',   dashboardRouter)
app.route('/ai',          aiRouter)
app.route('/condominos',  condominosRouter)

// ── Rotas públicas de propostas (path original preservado) ────────────────────
app.post('/public/propostas/sync',              (c) => propostasRouter.fetch(new Request(new URL('/public/sync', 'http://x'), c.req.raw), c.env, c.executionCtx))
app.post('/public/propostas/:codigo/estado',    (c) => propostasRouter.fetch(new Request(new URL(`/public/${c.req.param('codigo')}/estado`, 'http://x'), c.req.raw), c.env, c.executionCtx))

// ── Rotas públicas (sem prefixo /public no path original) ────────────────────
app.get('/qr',                publicRouter.fetch.bind(publicRouter))
app.post('/analyze-image',    publicRouter.fetch.bind(publicRouter))
app.get('/condominio/info',   publicRouter.fetch.bind(publicRouter))

// ── /public/* (categorias, validar-pin, limpezas, ocorrencias) ───────────────
app.route('/public', publicRouter)

// ── Rotas de intervencao (path original no root) ──────────────────────────────
app.get('/intervencao/:token',  (c) => ocorrenciasRouter.fetch(new Request(new URL(`/intervencao/${c.req.param('token')}`, 'http://x'), c.req.raw), c.env, c.executionCtx))
app.post('/intervencao/:token', (c) => ocorrenciasRouter.fetch(new Request(new URL(`/intervencao/${c.req.param('token')}`, 'http://x'), c.req.raw), c.env, c.executionCtx))

// ── Rotas no root que ficaram em sub-routers ──────────────────────────────────

// /limpezas — estava no root, handler em ocorrenciasRouter
app.get('/limpezas', requireAuth, (c) => ocorrenciasRouter.fetch(new Request(new URL('/limpezas', 'http://x'), c.req.raw), c.env, c.executionCtx))

// /nif/:nif — estava no root, handler em prestadoresRouter
app.get('/nif/:nif', requireAuth, (c) => prestadoresRouter.fetch(new Request(new URL(`/nif/${c.req.param('nif')}`, 'http://x'), c.req.raw), c.env, c.executionCtx))

// /utilizadores — estava no root, handler em adminRouter
app.get('/utilizadores', requireAuth, (c) => adminRouter.fetch(new Request(new URL('/utilizadores', 'http://x'), c.req.raw), c.env, c.executionCtx))

// /lojas — estava no root, handler em adminRouter
app.get('/lojas', requireAuth, (c) => adminRouter.fetch(new Request(new URL('/lojas', 'http://x'), c.req.raw), c.env, c.executionCtx))

// /servicos — estava no root, handler em contratosRouter
app.get('/servicos',  requireAuth, (c) => contratosRouter.fetch(new Request(new URL('/servicos', 'http://x'), c.req.raw), c.env, c.executionCtx))
app.post('/servicos', requireAuth, (c) => contratosRouter.fetch(new Request(new URL('/servicos', 'http://x'), c.req.raw), c.env, c.executionCtx))

// /prestador-servicos — estava no root, handler em prestadoresRouter (/prestadores/servicos)
app.post('/prestador-servicos', requireAuth, (c) => prestadoresRouter.fetch(new Request(new URL('/servicos', 'http://x'), c.req.raw), c.env, c.executionCtx))

// /prestadores/:id/contratos — estava no root, handler em contratosRouter (/contratos/prestador/:id)
app.get('/prestadores/:id/contratos', requireAuth, (c) => contratosRouter.fetch(new Request(new URL(`/prestador/${c.req.param('id')}`, 'http://x'), c.req.raw), c.env, c.executionCtx))

// ── /health e /me ─────────────────────────────────────────────────────────────
app.get('/health', healthHandler)
app.get('/me', requireAuth, meHandler)

// ── Export ────────────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (event.cron === '0 2 * * *') {
      const { neon } = await import('@neondatabase/serverless')
      const { syncTodasAsLojas } = await import('./lib/microsoft.js')
      const sql = neon(env.DATABASE_URL)
      ctx.waitUntil(syncTodasAsLojas(env, sql))
    }
    if (event.cron === '0 17 * * *') {
      ctx.waitUntil(enviarAlertasReunioes(env))
    }
  }
}
