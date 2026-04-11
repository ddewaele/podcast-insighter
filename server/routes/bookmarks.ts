import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

export async function bookmarkRoutes(app: FastifyInstance) {
  // GET /api/bookmarks — list all bookmarks for current user (with transcript title)
  app.get('/api/bookmarks', { preHandler: requireAuth }, async (request) => {
    const userId = request.session.get('userId')!
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: { transcript: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return bookmarks.map(b => ({
      id: b.id,
      transcriptId: b.transcriptId,
      transcriptTitle: b.transcript.title,
      itemType: b.itemType,
      itemId: b.itemId,
      createdAt: b.createdAt,
    }))
  })

  // GET /api/transcripts/:id/bookmarks — list bookmarked item IDs for a transcript
  app.get<{ Params: { id: string } }>('/api/transcripts/:id/bookmarks', { preHandler: requireAuth }, async (request) => {
    const userId = request.session.get('userId')!
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId, transcriptId: request.params.id },
    })
    return bookmarks.map(b => ({ id: b.id, itemType: b.itemType, itemId: b.itemId }))
  })

  // POST /api/bookmarks — create a bookmark
  app.post<{ Body: { transcriptId: string; itemType: string; itemId: string } }>(
    '/api/bookmarks',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const { transcriptId, itemType, itemId } = request.body
      if (!transcriptId || !itemType || !itemId) {
        return reply.status(400).send({ error: 'transcriptId, itemType, and itemId are required' })
      }

      // Verify access
      const t = await prisma.transcript.findUnique({ where: { id: transcriptId } })
      if (!t) return reply.status(404).send({ error: 'Transcript not found' })
      if (!t.isPublic && t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      // Upsert — ignore duplicates
      const existing = await prisma.bookmark.findUnique({
        where: { userId_transcriptId_itemType_itemId: { userId, transcriptId, itemType, itemId } },
      })
      if (existing) return existing

      reply.status(201)
      return prisma.bookmark.create({ data: { id: uuid(), userId, transcriptId, itemType, itemId } })
    },
  )

  // DELETE /api/bookmarks/:id — delete a bookmark
  app.delete<{ Params: { id: string } }>('/api/bookmarks/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const b = await prisma.bookmark.findUnique({ where: { id: request.params.id } })
    if (!b) return reply.status(404).send({ error: 'Not found' })
    if (b.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    await prisma.bookmark.delete({ where: { id: b.id } })
    return reply.status(204).send()
  })
}
