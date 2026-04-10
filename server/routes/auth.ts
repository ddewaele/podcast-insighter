import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { userQueries } from '../db.js'

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

      // Fetch Google profile
      const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
      if (!resp.ok) throw new Error('Failed to fetch Google profile')
      const profile = (await resp.json()) as GoogleProfile

      // Find or create user
      let user = userQueries.findByGoogleId.get(profile.id)
      if (!user) {
        const id = uuid()
        userQueries.create.run(id, profile.id, profile.email, profile.name, profile.picture ?? null)
        user = userQueries.findById.get(id)!
      }

      // Set session
      request.session.set('userId', user.id)
      await request.session.save()

      // Redirect to frontend
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

    const user = userQueries.findById.get(userId)
    if (!user) return reply.status(401).send({ error: 'User not found' })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    }
  })

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    await request.session.destroy()
    return reply.status(204).send()
  })
}
