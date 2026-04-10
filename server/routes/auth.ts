import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'

interface GoogleProfile {
  id: string
  email: string
  name: string
  picture: string
}

export async function authRoutes(app: FastifyInstance) {
  // GET /auth/google — handled by @fastify/oauth2 (startRedirectPath)

  // GET /auth/google/callback
  app.get('/auth/google/callback', async (request, reply) => {
    try {
      const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

      const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
      if (!resp.ok) throw new Error('Failed to fetch Google profile')
      const profile = (await resp.json()) as GoogleProfile

      // upsert so name/avatar stay current if the Google profile changes
      const user = await prisma.user.upsert({
        where: { googleId: profile.id },
        update: { name: profile.name, avatarUrl: profile.picture ?? null },
        create: {
          id: uuid(),
          googleId: profile.id,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture ?? null,
        },
      })

      request.session.set('userId', user.id)
      await request.session.save()

      reply.redirect(process.env.FRONTEND_URL ?? 'http://localhost:5173')
    } catch (err) {
      app.log.error(err)
      reply.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}?error=auth_failed`)
    }
  })

  // GET /api/auth/me
  app.get('/api/auth/me', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(401).send({ error: 'User not found' })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    }
  })

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    await request.session.destroy()
    return reply.status(204).send()
  })
}
