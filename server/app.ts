/**
 * Build the Fastify application instance.
 * Extracted from index.ts so tests can create an app without starting
 * the HTTP server or requiring Google OAuth credentials.
 */
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import { transcriptRoutes } from './routes/transcripts.js'

interface BuildAppOptions {
  sessionSecret?: string
  /** Route plugins to register (defaults to [transcriptRoutes]) */
  routes?: Array<(app: import('fastify').FastifyInstance) => Promise<void>>
}

export async function buildApp(opts: BuildAppOptions = {}) {
  const secret = opts.sessionSecret ?? process.env.SESSION_SECRET ?? 'test-secret-min-32-chars-long-enough!!'

  const app = Fastify({ logger: false })

  await app.register(cookie)
  await app.register(session, {
    secret,
    cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
    saveUninitialized: false,
  })

  const routes = opts.routes ?? [transcriptRoutes]
  for (const route of routes) {
    await app.register(route)
  }

  app.get('/api/health', async () => ({ ok: true }))

  return app
}
