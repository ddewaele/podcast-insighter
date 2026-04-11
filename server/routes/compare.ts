import type { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../db.js'
import { requireAuth } from '../middleware.js'

export interface ComparisonResult {
  shared_topics: string[]
  only_in_a: string[]
  only_in_b: string[]
  contradictions: Array<{ topic: string; position_a: string; position_b: string }>
  agreements: Array<{ topic: string; summary: string }>
  shared_references: Array<{ name: string; context_a: string; context_b: string }>
  verdict: string
}

const COMPARE_TOOL = {
  name: 'save_comparison',
  description: 'Save the comparison between two transcripts.',
  input_schema: {
    type: 'object' as const,
    required: ['shared_topics', 'only_in_a', 'only_in_b', 'contradictions', 'agreements', 'shared_references', 'verdict'],
    properties: {
      shared_topics: { type: 'array', items: { type: 'string' }, description: 'Topics discussed in both transcripts' },
      only_in_a: { type: 'array', items: { type: 'string' }, description: 'Topics only in transcript A' },
      only_in_b: { type: 'array', items: { type: 'string' }, description: 'Topics only in transcript B' },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['topic', 'position_a', 'position_b'],
          properties: {
            topic: { type: 'string' },
            position_a: { type: 'string' },
            position_b: { type: 'string' },
          },
        },
      },
      agreements: {
        type: 'array',
        items: {
          type: 'object',
          required: ['topic', 'summary'],
          properties: {
            topic: { type: 'string' },
            summary: { type: 'string' },
          },
        },
      },
      shared_references: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'context_a', 'context_b'],
          properties: {
            name: { type: 'string' },
            context_a: { type: 'string' },
            context_b: { type: 'string' },
          },
        },
      },
      verdict: { type: 'string', description: 'A 2-3 sentence overall take on the differences and similarities' },
    },
  },
}

export async function compareRoutes(app: FastifyInstance) {
  // POST /api/transcripts/compare — compare two transcripts using Claude
  app.post<{ Body: { idA: string; idB: string } }>(
    '/api/transcripts/compare',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.session.get('userId')!
      const { idA, idB } = request.body

      if (!idA || !idB || idA === idB) {
        return reply.status(400).send({ error: 'Two distinct transcript IDs are required' })
      }

      const [tA, tB] = await Promise.all([
        prisma.transcript.findUnique({ where: { id: idA }, select: { id: true, title: true, userId: true, isPublic: true, jsonData: true } }),
        prisma.transcript.findUnique({ where: { id: idB }, select: { id: true, title: true, userId: true, isPublic: true, jsonData: true } }),
      ])

      if (!tA || !tB) return reply.status(404).send({ error: 'One or both transcripts not found' })
      if ((!tA.isPublic && tA.userId !== userId) || (!tB.isPublic && tB.userId !== userId)) {
        return reply.status(403).send({ error: 'Forbidden' })
      }
      if (!tA.jsonData || !tB.jsonData) {
        return reply.status(400).send({ error: 'Both transcripts must have analysis data' })
      }

      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return reply.status(503).send({ error: 'AI comparison unavailable (ANTHROPIC_API_KEY not set)' })
      }

      const dataA = JSON.parse(tA.jsonData)
      const dataB = JSON.parse(tB.jsonData)

      const prompt = `Compare these two podcast/interview analyses and identify similarities, differences, contradictions, and agreements.

## Transcript A: "${tA.title}"
Summary: ${dataA.summary?.one_liner ?? ''}
Key Takeaways: ${(dataA.summary?.key_takeaways ?? []).join('; ')}
Primary Topics: ${(dataA.metadata?.primary_topics ?? []).join(', ')}
Insights: ${(dataA.insights ?? []).map((i: { claim: string }) => i.claim).join(' | ')}
References: ${(dataA.references ?? []).map((r: { name: string }) => r.name).join(', ')}

## Transcript B: "${tB.title}"
Summary: ${dataB.summary?.one_liner ?? ''}
Key Takeaways: ${(dataB.summary?.key_takeaways ?? []).join('; ')}
Primary Topics: ${(dataB.metadata?.primary_topics ?? []).join(', ')}
Insights: ${(dataB.insights ?? []).map((i: { claim: string }) => i.claim).join(' | ')}
References: ${(dataB.references ?? []).map((r: { name: string }) => r.name).join(', ')}

Call save_comparison with your analysis.`

      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        tools: [COMPARE_TOOL],
        tool_choice: { type: 'tool' as const, name: 'save_comparison' },
        messages: [{ role: 'user', content: prompt }],
      })

      const toolBlock = response.content.find(b => b.type === 'tool_use')
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        return reply.status(500).send({ error: 'AI comparison failed' })
      }

      return {
        transcriptA: { id: tA.id, title: tA.title },
        transcriptB: { id: tB.id, title: tB.title },
        comparison: toolBlock.input as ComparisonResult,
      }
    },
  )
}
