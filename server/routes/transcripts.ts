import type { FastifyInstance } from 'fastify'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { transcriptQueries, userQueries } from '../db.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..', '..')

function requireAuth(request: Parameters<Parameters<FastifyInstance['addHook']>[1]>[0], reply: Parameters<Parameters<FastifyInstance['addHook']>[1]>[2]) {
  const userId = request.session.get('userId')
  if (!userId) {
    reply.status(401).send({ error: 'Not authenticated' })
    return null
  }
  return userId
}

export async function transcriptRoutes(app: FastifyInstance) {
  // GET /api/transcripts — list own + public transcripts
  app.get('/api/transcripts', async (request, reply) => {
    const userId = request.session.get('userId') ?? ''
    const rows = transcriptQueries.listForUser.all(userId)

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      youtubeUrl: row.youtube_url,
      videoId: row.video_id,
      status: row.status,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwner: row.user_id === userId,
      owner: {
        id: row.user_id,
        name: row.owner_name,
        avatarUrl: row.owner_avatar,
      },
    }))
  })

  // GET /api/transcripts/:id — single transcript with full JSON data
  app.get<{ Params: { id: string } }>('/api/transcripts/:id', async (request, reply) => {
    const userId = request.session.get('userId') ?? ''
    const row = transcriptQueries.findById.get(request.params.id)

    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (!row.is_public && row.user_id !== userId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const owner = userQueries.findById.get(row.user_id)

    let data = null
    if (row.json_path && existsSync(row.json_path)) {
      data = JSON.parse(readFileSync(row.json_path, 'utf-8'))
    }

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      youtubeUrl: row.youtube_url,
      videoId: row.video_id,
      status: row.status,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwner: row.user_id === userId,
      owner: owner
        ? { id: owner.id, name: owner.name, avatarUrl: owner.avatar_url }
        : null,
      data,
    }
  })

  // POST /api/transcripts — upload a transcript JSON
  app.post<{
    Body: { title: string; isPublic?: boolean; data: unknown; youtubeUrl?: string; videoId?: string }
  }>('/api/transcripts', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const { title, isPublic = false, data, youtubeUrl, videoId } = request.body
    if (!title || !data) return reply.status(400).send({ error: 'title and data are required' })

    const id = uuid()
    const outDir = join(ROOT, 'output', `${id}-analysis`)
    mkdirSync(outDir, { recursive: true })
    const jsonPath = join(outDir, 'transcript_analysis.json')
    writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')

    transcriptQueries.create.run(id, userId, title, youtubeUrl ?? null, videoId ?? null, 'ready', jsonPath)
    if (isPublic) transcriptQueries.updateVisibility.run(1, id)

    reply.status(201)
    return { id }
  })

  // PATCH /api/transcripts/:id — update visibility
  app.patch<{
    Params: { id: string }
    Body: { isPublic?: boolean; title?: string }
  }>('/api/transcripts/:id', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const row = transcriptQueries.findById.get(request.params.id)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (row.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' })

    const { isPublic } = request.body
    if (isPublic !== undefined) {
      transcriptQueries.updateVisibility.run(isPublic ? 1 : 0, row.id)
    }

    return { ok: true }
  })

  // DELETE /api/transcripts/:id
  app.delete<{ Params: { id: string } }>('/api/transcripts/:id', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const row = transcriptQueries.findById.get(request.params.id)
    if (!row) return reply.status(404).send({ error: 'Not found' })
    if (row.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' })

    transcriptQueries.delete.run(row.id)
    return reply.status(204).send()
  })
}
