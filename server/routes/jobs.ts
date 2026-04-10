import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { jobQueries, transcriptQueries } from '../db.js'
import { runFakePipeline } from '../pipeline/fake.js'

// In-memory SSE subscriber map: jobId → array of writer functions
const subscribers = new Map<string, Array<(data: string) => void>>()

function broadcast(jobId: string, payload: object) {
  const writers = subscribers.get(jobId)
  if (!writers) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const write of writers) write(data)
}

export async function jobRoutes(app: FastifyInstance) {
  // POST /api/jobs — submit a YouTube URL, start the fake pipeline
  app.post<{ Body: { youtubeUrl: string } }>('/api/jobs', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const { youtubeUrl } = request.body
    if (!youtubeUrl) return reply.status(400).send({ error: 'youtubeUrl is required' })

    // Extract video ID from URL
    const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    const videoId = match?.[1] ?? null

    // Create a placeholder transcript
    const transcriptId = uuid()
    transcriptQueries.create.run(
      transcriptId, userId,
      `Processing: ${youtubeUrl}`,
      youtubeUrl, videoId,
      'processing', null
    )

    // Create a job
    const jobId = uuid()
    jobQueries.create.run(jobId, userId, youtubeUrl)

    // Run the fake pipeline asynchronously (don't await)
    runFakePipeline(jobId, transcriptId, youtubeUrl, (status, pct, detail) => {
      broadcast(jobId, { stage: status, pct, detail })
      if (status === 'done') {
        // Close all SSE connections for this job
        subscribers.delete(jobId)
      }
    }).catch(err => app.log.error(err))

    reply.status(202)
    return { jobId, transcriptId }
  })

  // GET /api/jobs/:id — job status
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const job = jobQueries.findById.get(request.params.id)
    if (!job) return reply.status(404).send({ error: 'Not found' })
    if (job.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' })

    return {
      id: job.id,
      transcriptId: job.transcript_id,
      youtubeUrl: job.youtube_url,
      status: job.status,
      progress: job.progress,
      detail: job.detail,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }
  })

  // GET /api/jobs/:id/progress — SSE stream
  app.get<{ Params: { id: string } }>('/api/jobs/:id/progress', async (request, reply) => {
    const userId = request.session.get('userId')
    if (!userId) return reply.status(401).send({ error: 'Not authenticated' })

    const job = jobQueries.findById.get(request.params.id)
    if (!job) return reply.status(404).send({ error: 'Not found' })
    if (job.user_id !== userId) return reply.status(403).send({ error: 'Forbidden' })

    // If already done, send final event immediately
    if (job.status === 'done' || job.status === 'error') {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      reply.raw.write(`data: ${JSON.stringify({ stage: job.status, pct: job.progress, detail: job.detail, resultId: job.transcript_id })}\n\n`)
      reply.raw.end()
      return reply
    }

    // Open SSE connection
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    reply.raw.write(': connected\n\n')

    const write = (data: string) => reply.raw.write(data)

    if (!subscribers.has(job.id)) subscribers.set(job.id, [])
    subscribers.get(job.id)!.push(write)

    // Clean up on client disconnect
    request.socket.on('close', () => {
      const writers = subscribers.get(job.id)
      if (writers) {
        const idx = writers.indexOf(write)
        if (idx !== -1) writers.splice(idx, 1)
        if (writers.length === 0) subscribers.delete(job.id)
      }
    })

    // Keep connection open — Fastify should not send a reply
    return reply
  })
}
