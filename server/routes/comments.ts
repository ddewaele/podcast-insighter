import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

function serializeComment(c: {
  id: string; userId: string; transcriptId: string; parentId: string | null
  body: string; createdAt: Date; updatedAt: Date
  user: { id: string; name: string; avatarUrl: string | null }
  replies?: Array<{
    id: string; userId: string; transcriptId: string; parentId: string | null
    body: string; createdAt: Date; updatedAt: Date
    user: { id: string; name: string; avatarUrl: string | null }
  }>
}) {
  return {
    id: c.id,
    userId: c.userId,
    transcriptId: c.transcriptId,
    parentId: c.parentId,
    body: c.body,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: { id: c.user.id, name: c.user.name, avatarUrl: c.user.avatarUrl },
    replies: c.replies?.map(r => serializeComment(r)) ?? [],
  }
}

export async function commentRoutes(app: FastifyInstance) {
  // GET /api/transcripts/:id/comments — list top-level comments with replies
  app.get<{ Params: { id: string } }>('/api/transcripts/:id/comments', async (request, reply) => {
    const userId = request.session.get('userId') ?? ''
    const transcriptId = request.params.id

    const t = await prisma.transcript.findUnique({ where: { id: transcriptId } })
    if (!t) return reply.status(404).send({ error: 'Not found' })
    if (!t.isPublic && t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

    const comments = await prisma.comment.findMany({
      where: { transcriptId, parentId: null },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        replies: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return comments.map(c => serializeComment(c))
  })

  // POST /api/transcripts/:id/comments — create a comment or reply
  app.post<{ Params: { id: string }; Body: { body: string; parentId?: string } }>(
    '/api/transcripts/:id/comments',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const transcriptId = request.params.id
      const body = (request.body.body ?? '').trim()
      if (!body) return reply.status(400).send({ error: 'body is required' })

      const t = await prisma.transcript.findUnique({ where: { id: transcriptId } })
      if (!t) return reply.status(404).send({ error: 'Not found' })
      if (!t.isPublic && t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      // Validate parentId if provided
      if (request.body.parentId) {
        const parent = await prisma.comment.findUnique({ where: { id: request.body.parentId } })
        if (!parent || parent.transcriptId !== transcriptId) {
          return reply.status(400).send({ error: 'Invalid parentId' })
        }
      }

      const comment = await prisma.comment.create({
        data: {
          id: uuid(),
          userId,
          transcriptId,
          parentId: request.body.parentId ?? null,
          body,
        },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          replies: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        },
      })

      reply.status(201)
      return serializeComment(comment)
    },
  )

  // DELETE /api/comments/:id — delete a comment (owner only)
  app.delete<{ Params: { id: string } }>('/api/comments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const c = await prisma.comment.findUnique({ where: { id: request.params.id } })
    if (!c) return reply.status(404).send({ error: 'Not found' })
    if (c.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    await prisma.comment.delete({ where: { id: c.id } })
    return reply.status(204).send()
  })
}
