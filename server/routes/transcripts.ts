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

// Extract a short snippet from json_data showing where the query matched
function extractSnippet(jsonData: string, q: string): { matchType: string; snippet: string } | null {
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(jsonData) } catch { return null }

  const lower = q.toLowerCase()

  const summary = parsed.summary as { one_liner?: string; executive_summary?: string; key_takeaways?: string[] } | undefined
  if (summary?.one_liner?.toLowerCase().includes(lower))
    return { matchType: 'Summary', snippet: summary.one_liner! }

  const quotes = parsed.quotes as Array<{ text: string; speaker: string }> | undefined
  const matchedQuote = quotes?.find(quote => quote.text.toLowerCase().includes(lower))
  if (matchedQuote)
    return { matchType: `Quote — ${matchedQuote.speaker}`, snippet: matchedQuote.text }

  const insights = parsed.insights as Array<{ claim: string; speaker: string }> | undefined
  const matchedInsight = insights?.find(i => i.claim.toLowerCase().includes(lower))
  if (matchedInsight)
    return { matchType: `Insight — ${matchedInsight.speaker}`, snippet: matchedInsight.claim }

  const references = parsed.references as Array<{ name: string; context: string }> | undefined
  const matchedRef = references?.find(r => r.name.toLowerCase().includes(lower) || r.context.toLowerCase().includes(lower))
  if (matchedRef)
    return { matchType: 'Reference', snippet: matchedRef.name }

  return { matchType: 'Content', snippet: '' }
}

export async function transcriptRoutes(app: FastifyInstance) {
  // GET /api/transcripts/search?q=<query> — full-text search across own + public transcripts
  // Registered before /:id so Fastify doesn't match "search" as a param
  app.get<{ Querystring: { q?: string } }>('/api/transcripts/search', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const q = (request.query.q ?? '').trim()
    if (!q || q.length < 2) return reply.status(400).send({ error: 'Query must be at least 2 characters' })

    const transcripts = await prisma.transcript.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
        AND: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { jsonData: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return transcripts.map(t => ({
      ...serializeTranscript(t, userId),
      match: t.jsonData ? extractSnippet(t.jsonData, q) : null,
    }))
  })

  // GET /api/transcripts/export — export all own transcripts (+ optionally public) as JSON
  // Registered before /:id so Fastify doesn't match "export" as a param
  app.get<{ Querystring: { includePublic?: string } }>('/api/transcripts/export', { preHandler: requireAuth }, async (request) => {
    const userId = request.session.get('userId')!
    const includePublic = request.query.includePublic === 'true'

    const where = includePublic
      ? { OR: [{ userId }, { isPublic: true }] }
      : { userId }

    const transcripts = await prisma.transcript.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      count: transcripts.length,
      transcripts: transcripts.map(t => ({
        title: t.title,
        youtubeUrl: t.youtubeUrl,
        videoId: t.videoId,
        status: t.status,
        isPublic: t.isPublic,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        data: t.jsonData ? JSON.parse(t.jsonData) : null,
      })),
    }
  })

  // POST /api/transcripts/import — import transcripts from an export JSON
  // Registered before /:id so Fastify doesn't match "import" as a param
  app.post<{ Body: { transcripts: Array<{ title: string; youtubeUrl?: string; videoId?: string; isPublic?: boolean; data: unknown }> } }>(
    '/api/transcripts/import',
    { preHandler: requireAuth, bodyLimit: 50 * 1024 * 1024 },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const { transcripts: items } = request.body
      if (!Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ error: 'transcripts array is required' })
      }

      let imported = 0
      let skipped = 0

      for (const item of items) {
        if (!item.title || !item.data) {
          skipped++
          continue
        }
        await prisma.transcript.create({
          data: {
            id: uuid(),
            userId,
            title: item.title,
            youtubeUrl: item.youtubeUrl ?? null,
            videoId: item.videoId ?? null,
            status: 'ready',
            isPublic: item.isPublic ?? false,
            jsonData: JSON.stringify(item.data),
          },
        })
        imported++
      }

      return { imported, skipped, total: items.length }
    },
  )

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
