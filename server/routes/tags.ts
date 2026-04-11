import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

export async function tagRoutes(app: FastifyInstance) {
  // GET /api/tags — list all tags for the current user (with transcript counts)
  app.get('/api/tags', { preHandler: requireAuth }, async (request) => {
    const userId = request.session.get('userId')!
    const tags = await prisma.tag.findMany({
      where: { userId },
      include: { _count: { select: { transcripts: true } } },
      orderBy: { name: 'asc' },
    })
    return tags.map(t => ({ id: t.id, name: t.name, count: t._count.transcripts }))
  })

  // POST /api/tags — create a new tag (or return existing)
  app.post<{ Body: { name: string } }>('/api/tags', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const name = (request.body.name ?? '').trim()
    if (!name) return reply.status(400).send({ error: 'name is required' })

    const existing = await prisma.tag.findUnique({ where: { userId_name: { userId, name } } })
    if (existing) return existing

    reply.status(201)
    return prisma.tag.create({ data: { id: uuid(), userId, name } })
  })

  // DELETE /api/tags/:id — delete a tag
  app.delete<{ Params: { id: string } }>('/api/tags/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const tag = await prisma.tag.findUnique({ where: { id: request.params.id } })
    if (!tag) return reply.status(404).send({ error: 'Not found' })
    if (tag.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    await prisma.tag.delete({ where: { id: tag.id } })
    return reply.status(204).send()
  })

  // GET /api/transcripts/:id/tags — list tags for a transcript
  app.get<{ Params: { id: string } }>('/api/transcripts/:id/tags', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const t = await prisma.transcript.findUnique({ where: { id: request.params.id } })
    if (!t) return reply.status(404).send({ error: 'Not found' })
    if (t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    const rows = await prisma.transcriptTag.findMany({
      where: { transcriptId: request.params.id },
      include: { tag: true },
    })
    return rows.map(r => ({ id: r.tag.id, name: r.tag.name }))
  })

  // PUT /api/transcripts/:id/tags — set tags on a transcript (replace all)
  app.put<{ Params: { id: string }; Body: { tagIds: string[] } }>(
    '/api/transcripts/:id/tags',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const t = await prisma.transcript.findUnique({ where: { id: request.params.id } })
      if (!t) return reply.status(404).send({ error: 'Not found' })
      if (t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

      const { tagIds } = request.body
      if (!Array.isArray(tagIds)) return reply.status(400).send({ error: 'tagIds must be an array' })

      // Delete all existing, then create new ones
      await prisma.transcriptTag.deleteMany({ where: { transcriptId: t.id } })
      if (tagIds.length > 0) {
        await prisma.transcriptTag.createMany({
          data: tagIds.map(tagId => ({ transcriptId: t.id, tagId })),
          skipDuplicates: true,
        })
      }
      return { ok: true }
    },
  )
}
