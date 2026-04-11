import type { FastifyInstance } from 'fastify'
import { v4 as uuid } from 'uuid'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'
import { runFakePipeline } from '../pipeline/fake.js'
import { runPipeline } from '../pipeline/real.js'

const useRealPipeline = !!process.env.ANTHROPIC_API_KEY

const subscribers = new Map<string, Array<(data: string) => void>>()
const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }

function broadcast(jobId: string, payload: object) {
  const writers = subscribers.get(jobId)
  if (!writers) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const write of writers) write(data)
}

export async function jobRoutes(app: FastifyInstance) {
  // POST /api/jobs — submit a YouTube URL, start the pipeline
  app.post<{ Body: { youtubeUrl: string } }>('/api/jobs', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const { youtubeUrl } = request.body
    if (!youtubeUrl) return reply.status(400).send({ error: 'youtubeUrl is required' })

    const match = youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    const videoId = match?.[1] ?? null

    const transcriptId = uuid()
    await prisma.transcript.create({
      data: {
        id: transcriptId,
        userId,
        title: videoId ? `Generating… (${videoId})` : `Generating… (${youtubeUrl})`,
        youtubeUrl,
        videoId,
        status: 'processing',
      },
    })

    const jobId = uuid()
    await prisma.job.create({ data: { id: jobId, userId, youtubeUrl } })

    const run = useRealPipeline ? runPipeline : runFakePipeline
    run(jobId, transcriptId, youtubeUrl, (status, pct, detail) => {
      broadcast(jobId, { stage: status, pct, detail })
      if (status === 'done' || status === 'error') subscribers.delete(jobId)
    }).catch(err => app.log.error(err))

    reply.status(202)
    return { jobId, transcriptId }
  })

  // GET /api/jobs/:id — job status
  app.get<{ Params: { id: string } }>('/api/jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const job = await prisma.job.findUnique({ where: { id: request.params.id } })
    if (!job) return reply.status(404).send({ error: 'Not found' })
    if (job.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })
    return {
      id: job.id,
      transcriptId: job.transcriptId,
      youtubeUrl: job.youtubeUrl,
      status: job.status,
      progress: job.progress,
      detail: job.detail,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  })

  // GET /api/jobs/:id/progress — SSE stream
  app.get<{ Params: { id: string } }>('/api/jobs/:id/progress', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session.get('userId')!
    const job = await prisma.job.findUnique({ where: { id: request.params.id } })
    if (!job) return reply.status(404).send({ error: 'Not found' })
    if (job.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

    if (job.status === 'done' || job.status === 'error') {
      reply.raw.writeHead(200, SSE_HEADERS)
      reply.raw.write(`data: ${JSON.stringify({ stage: job.status, pct: job.progress, detail: job.detail, resultId: job.transcriptId })}\n\n`)
      reply.raw.end()
      return reply
    }

    reply.raw.writeHead(200, SSE_HEADERS)
    reply.raw.write(': connected\n\n')

    const write = (data: string) => reply.raw.write(data)
    if (!subscribers.has(job.id)) subscribers.set(job.id, [])
    subscribers.get(job.id)!.push(write)

    request.socket.on('close', () => {
      const writers = subscribers.get(job.id)
      if (writers) {
        const idx = writers.indexOf(write)
        if (idx !== -1) writers.splice(idx, 1)
        if (writers.length === 0) subscribers.delete(job.id)
      }
    })

    return reply
  })
}
