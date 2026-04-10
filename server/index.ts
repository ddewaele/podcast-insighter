import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import oauthPlugin from '@fastify/oauth2'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { authRoutes } from './routes/auth.js'
import { transcriptRoutes } from './routes/transcripts.js'
import { jobRoutes } from './routes/jobs.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const app = Fastify({ logger: { level: 'info' } })

// CORS — allow the Vite dev server
await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
})

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

// Routes
await app.register(authRoutes)
await app.register(transcriptRoutes)
await app.register(jobRoutes)

// Health check
app.get('/api/health', async () => ({ ok: true }))

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
