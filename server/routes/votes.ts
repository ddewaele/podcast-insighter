import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

export async function voteRoutes(app: FastifyInstance) {
  // GET /api/transcripts/:id/vote — get vote counts + current user's vote
  app.get<{ Params: { id: string } }>('/api/transcripts/:id/vote', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const transcriptId = request.params.id

    const [upvotes, downvotes, userVote] = await Promise.all([
      prisma.vote.count({ where: { transcriptId, value: 1 } }),
      prisma.vote.count({ where: { transcriptId, value: -1 } }),
      prisma.vote.findUnique({ where: { userId_transcriptId: { userId, transcriptId } } }),
    ])

    return { upvotes, downvotes, userVote: userVote?.value ?? null }
  })

  // POST /api/transcripts/:id/vote — cast or retract a vote
  app.post<{ Params: { id: string }; Body: { value: number } }>(
    '/api/transcripts/:id/vote',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const transcriptId = request.params.id
      const value = request.body.value

      if (value !== 1 && value !== -1 && value !== 0) {
        return reply.status(400).send({ error: 'value must be 1, -1, or 0 (to retract)' })
      }

      const t = await prisma.transcript.findUnique({ where: { id: transcriptId } })
      if (!t) return reply.status(404).send({ error: 'Not found' })
      if (!t.isPublic && t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      if (value === 0) {
        // Retract vote
        await prisma.vote.deleteMany({ where: { userId, transcriptId } })
      } else {
        await prisma.vote.upsert({
          where: { userId_transcriptId: { userId, transcriptId } },
          create: { userId, transcriptId, value },
          update: { value },
        })
      }

      const [upvotes, downvotes] = await Promise.all([
        prisma.vote.count({ where: { transcriptId, value: 1 } }),
        prisma.vote.count({ where: { transcriptId, value: -1 } }),
      ])

      return { upvotes, downvotes, userVote: value === 0 ? null : value }
    },
  )
}
