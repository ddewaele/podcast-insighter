import type { FastifyInstance } from 'fastify'
import type { Transcript, User } from '@prisma/client'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

type TranscriptWithUser = Transcript & { user: User }

function serializeTranscript(t: TranscriptWithUser, userId: string) {
  return {
    id: t.id,
    userId: t.userId,
    title: t.title,
    youtubeUrl: t.youtubeUrl,
    videoId: t.videoId,
    status: t.status,
    isPublic: t.isPublic,
    hasData: t.jsonData !== null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    isOwner: t.userId === userId,
    owner: { id: t.user.id, name: t.user.name, avatarUrl: t.user.avatarUrl },
  }
}

export async function transcriptRoutes(app: FastifyInstance) {
  // GET /api/transcripts — list own + public transcripts (no auth required; guests see public only)
  app.get('/api/transcripts', async (request) => {
    const userId = request.session.get('userId') ?? ''
    const transcripts = await prisma.transcript.findMany({
      where: { OR: [{ isPublic: true }, { userId }] },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    })
    return transcripts.map(t => serializeTranscript(t, userId))
  })

  // GET /api/transcripts/:id — single transcript with full JSON data
  app.get<{ Params: { id: string } }>('/api/transcripts/:id', async (request, reply) => {
    const userId = request.session.get('userId') ?? ''
    const t = await prisma.transcript.findUnique({
      where: { id: request.params.id },
      include: { user: true },
    })
    if (!t) return reply.status(404).send({ error: 'Not found' })
    if (!t.isPublic && t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    return { ...serializeTranscript(t, userId), data: t.jsonData ? JSON.parse(t.jsonData) : null }
  })

  // POST /api/transcripts — upload a transcript JSON
  app.post<{
    Body: { title: string; isPublic?: boolean; data: unknown; youtubeUrl?: string; videoId?: string }
  }>('/api/transcripts', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const { title, isPublic = false, data, youtubeUrl, videoId } = request.body
    if (!title || !data) return reply.status(400).send({ error: 'title and data are required' })

    const t = await prisma.transcript.create({
      data: {
        id: uuid(),
        userId,
        title,
        youtubeUrl: youtubeUrl ?? null,
        videoId: videoId ?? null,
        status: 'ready',
        isPublic,
        jsonData: JSON.stringify(data),
      },
    })
    reply.status(201)
    return { id: t.id }
  })

  // PATCH /api/transcripts/:id — update visibility or title
  app.patch<{
    Params: { id: string }
    Body: { isPublic?: boolean; title?: string }
  }>('/api/transcripts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const { isPublic, title } = request.body
    if (isPublic === undefined && title === undefined)
      return reply.status(400).send({ error: 'Nothing to update' })

    const t = await prisma.transcript.findUnique({ where: { id: request.params.id } })
    if (!t) return reply.status(404).send({ error: 'Not found' })
    if (t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

    await prisma.transcript.update({
      where: { id: t.id },
      data: {
        ...(isPublic !== undefined && { isPublic }),
        ...(title !== undefined && { title }),
      },
    })
    return { ok: true }
  })

  // DELETE /api/transcripts/:id
  app.delete<{ Params: { id: string } }>('/api/transcripts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const t = await prisma.transcript.findUnique({ where: { id: request.params.id } })
    if (!t) return reply.status(404).send({ error: 'Not found' })
    if (t.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    await prisma.transcript.delete({ where: { id: t.id } })
    return reply.status(204).send()
  })
}
