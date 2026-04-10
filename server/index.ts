import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import oauthPlugin from '@fastify/oauth2'
import staticPlugin from '@fastify/static'
import { existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { authRoutes } from './routes/auth.js'
import { transcriptRoutes } from './routes/transcripts.js'
import { jobRoutes } from './routes/jobs.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = Fastify({ logger: { level: isProd ? 'warn' : 'info' } })

// In production the server itself serves the frontend — no CORS needed.
// In dev we allow the Vite origin.
if (!isProd) {
  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })
}

// Cookies
await app.register(cookie)

// Sessions
await app.register(session, {
  secret: process.env.SESSION_SECRET ?? 'replace-this-secret-in-production-min-32-chars!!',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
  saveUninitialized: false,
})

// Google OAuth2
await app.register(oauthPlugin, {
  name: 'googleOAuth2',
  scope: ['openid', 'email', 'profile'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID ?? '',
      secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
    auth: oauthPlugin.GOOGLE_CONFIGURATION,
  },
  startRedirectPath: '/auth/google',
  callbackUri: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/auth/google/callback',
})

// Routes (registered before static so /api/* always wins)
await app.register(authRoutes)
await app.register(transcriptRoutes)
await app.register(jobRoutes)

// Health check
app.get('/api/health', async () => ({ ok: true }))

// In production: serve the built frontend and fall back to index.html for SPA routing
if (isProd) {
  const distPath = join(__dirname, '..', 'dist')
  if (existsSync(distPath)) {
    await app.register(staticPlugin, { root: distPath, prefix: '/' })
    app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
  } else {
    app.log.warn('dist/ not found — frontend not served. Run `npm run build` first.')
  }
}

// Start
const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

try {
  await app.listen({ port, host })
  console.log(`Server running at http://localhost:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
