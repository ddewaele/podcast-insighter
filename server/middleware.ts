import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.get('userId'))
    return reply.status(401).send({ error: 'Not authenticated' })
}
