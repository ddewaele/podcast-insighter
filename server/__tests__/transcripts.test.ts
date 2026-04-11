import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { prisma } from '../db.js'
import { v4 as uuid } from 'uuid'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let testUserId: string
let otherUserId: string

/** Inject a request with a fake session userId. */
function authed(userId: string) {
  return {
    headers: { cookie: '' },
    // Fastify session: we override the session getter for testing
  }
}

/**
 * Create a session cookie by hitting a helper route that sets userId in the session.
 * This avoids mocking session internals.
 */
async function getSessionCookie(userId: string): Promise<string> {
  // Register a one-time helper if not already there
  const res = await app.inject({
    method: 'GET',
    url: `/__test/login?userId=${userId}`,
  })
  const setCookie = res.headers['set-cookie']
  if (!setCookie) throw new Error('No set-cookie header from test login')
  // Extract just the cookie value
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return cookieStr.split(';')[0]
}

beforeAll(async () => {
  app = await buildApp({ skipOAuth: true })

  // Register a test-only route that creates a session
  app.get('/__test/login', async (request, reply) => {
    const userId = (request.query as Record<string, string>).userId
    request.session.set('userId', userId)
    await request.session.save()
    return { ok: true }
  })

  await app.ready()

  // Create test users
  testUserId = uuid()
  otherUserId = uuid()
  await prisma.user.createMany({
    data: [
      { id: testUserId, googleId: `g-${testUserId}`, email: `test-${testUserId}@test.com`, name: 'Test User' },
      { id: otherUserId, googleId: `g-${otherUserId}`, email: `other-${otherUserId}@test.com`, name: 'Other User' },
    ],
  })
})

afterAll(async () => {
  // Clean up test data
  await prisma.transcript.deleteMany({ where: { userId: { in: [testUserId, otherUserId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [testUserId, otherUserId] } } })
  await app.close()
})

beforeEach(async () => {
  await prisma.transcript.deleteMany({ where: { userId: { in: [testUserId, otherUserId] } } })
})

describe('GET /api/transcripts/export', () => {
  it('returns only own transcripts by default', async () => {
    const cookie = await getSessionCookie(testUserId)

    // Create one own and one other-user public transcript
    await prisma.transcript.create({
      data: { id: uuid(), userId: testUserId, title: 'My transcript', status: 'ready', jsonData: '{"metadata":{}}' },
    })
    await prisma.transcript.create({
      data: { id: uuid(), userId: otherUserId, title: 'Public other', status: 'ready', isPublic: true, jsonData: '{"metadata":{}}' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/transcripts/export',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(1)
    expect(body.count).toBe(1)
    expect(body.transcripts).toHaveLength(1)
    expect(body.transcripts[0].title).toBe('My transcript')
  })

  it('includes public transcripts when includePublic=true', async () => {
    const cookie = await getSessionCookie(testUserId)

    await prisma.transcript.create({
      data: { id: uuid(), userId: testUserId, title: 'Mine-test', status: 'ready', jsonData: '{}' },
    })
    await prisma.transcript.create({
      data: { id: uuid(), userId: otherUserId, title: 'Public-test', status: 'ready', isPublic: true, jsonData: '{}' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/transcripts/export?includePublic=true',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    const titles = body.transcripts.map((t: { title: string }) => t.title)
    expect(titles).toContain('Mine-test')
    expect(titles).toContain('Public-test')
    // Must include at least both our test transcripts (may include other public data in the dev DB)
    expect(body.count).toBeGreaterThanOrEqual(2)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/transcripts/export',
    })
    expect(res.statusCode).toBe(401)
  })

  it('includes full data in each transcript', async () => {
    const cookie = await getSessionCookie(testUserId)
    const analysisData = { metadata: { title: 'Test' }, summary: { one_liner: 'Hi' } }

    await prisma.transcript.create({
      data: { id: uuid(), userId: testUserId, title: 'With data', status: 'ready', jsonData: JSON.stringify(analysisData) },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/transcripts/export',
      headers: { cookie },
    })

    const body = res.json()
    expect(body.transcripts[0].data).toEqual(analysisData)
  })
})

describe('POST /api/transcripts/import', () => {
  it('imports transcripts and returns count', async () => {
    const cookie = await getSessionCookie(testUserId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/import',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        transcripts: [
          { title: 'Imported 1', data: { metadata: {} } },
          { title: 'Imported 2', data: { metadata: {} }, youtubeUrl: 'https://youtu.be/abc123' },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.imported).toBe(2)
    expect(body.skipped).toBe(0)

    // Verify they exist in the DB under our user
    const dbRows = await prisma.transcript.findMany({ where: { userId: testUserId } })
    expect(dbRows).toHaveLength(2)
    expect(dbRows.map(r => r.title).sort()).toEqual(['Imported 1', 'Imported 2'])
  })

  it('skips transcripts without title or data', async () => {
    const cookie = await getSessionCookie(testUserId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/import',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        transcripts: [
          { title: 'Valid', data: { metadata: {} } },
          { title: '', data: { metadata: {} } },           // empty title
          { title: 'No data', data: null },                 // null data
          { title: 'Missing data' } as any,                 // no data field
        ],
      },
    })

    const body = res.json()
    expect(body.imported).toBe(1)
    expect(body.skipped).toBe(3)
  })

  it('returns 400 for empty transcripts array', async () => {
    const cookie = await getSessionCookie(testUserId)

    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/import',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { transcripts: [] },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/transcripts/import',
      headers: { 'content-type': 'application/json' },
      payload: { transcripts: [{ title: 'X', data: {} }] },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('export → import round-trip', () => {
  it('exported data can be re-imported', async () => {
    const cookie = await getSessionCookie(testUserId)

    // Create some transcripts
    await prisma.transcript.create({
      data: { id: uuid(), userId: testUserId, title: 'Transcript A', status: 'ready', videoId: 'abc', jsonData: '{"quotes":[]}' },
    })
    await prisma.transcript.create({
      data: { id: uuid(), userId: testUserId, title: 'Transcript B', status: 'ready', jsonData: '{"quotes":[]}' },
    })

    // Export
    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/transcripts/export',
      headers: { cookie },
    })
    const exported = exportRes.json()
    expect(exported.count).toBe(2)

    // Delete all transcripts
    await prisma.transcript.deleteMany({ where: { userId: testUserId } })

    // Import the exported data
    const importRes = await app.inject({
      method: 'POST',
      url: '/api/transcripts/import',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { transcripts: exported.transcripts },
    })

    const importResult = importRes.json()
    expect(importResult.imported).toBe(2)

    // Verify
    const dbRows = await prisma.transcript.findMany({ where: { userId: testUserId }, orderBy: { title: 'asc' } })
    expect(dbRows).toHaveLength(2)
    expect(dbRows[0].title).toBe('Transcript A')
    expect(dbRows[0].videoId).toBe('abc')
    expect(dbRows[1].title).toBe('Transcript B')
    expect(JSON.parse(dbRows[0].jsonData!)).toEqual({ quotes: [] })
  })
})
