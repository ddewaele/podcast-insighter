import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/** Minimal but complete TranscriptAnalysis JSON that the Dashboard can render. */
function makeSampleAnalysis(title: string) {
  return {
    metadata: {
      title,
      speakers: ['Alice (Host)', 'Bob (Guest)'],
      estimated_duration_minutes: 45,
      primary_topics: ['testing', 'automation'],
      date_hint: '2026-04-11',
    },
    summary: {
      one_liner: 'A conversation about testing practices.',
      executive_summary: 'Alice and Bob discuss the importance of end-to-end testing in modern web applications.',
      key_takeaways: ['E2E tests catch bugs that unit tests miss'],
    },
    quotes: [
      { id: 'q1', text: 'The best test is one that actually runs.', speaker: 'Alice', context: 'On test reliability', tags: ['quotable'] },
    ],
    insights: [
      { id: 'i1', claim: 'E2E tests provide the highest confidence.', speaker: 'Alice', supporting_detail: 'They test the full stack.', novelty: 'low', tags: ['tooling'] },
    ],
    references: [
      { id: 'r1', name: 'Playwright', type: 'tool', url: 'https://playwright.dev', context: 'Primary testing framework.', mentioned_by: 'Alice' },
    ],
    disagreements_and_nuance: [
      { topic: 'Unit vs E2E tests', positions: [{ speaker: 'Alice', position: 'E2E first' }, { speaker: 'Bob', position: 'Unit first' }], resolution: 'Agreed both are needed.' },
    ],
    topic_segments: [
      { approximate_position: 'early', topic: 'Why test', summary: 'Discussion of testing motivation.' },
      { approximate_position: 'mid', topic: 'Tooling', summary: 'Comparison of testing tools.' },
    ],
  }
}

/** Create a transcript via API. Uses unique title prefix to avoid cross-test collisions. */
async function createTranscript(request: any, title: string) {
  const res = await request.post('/api/transcripts', {
    data: { title, data: makeSampleAnalysis(title) },
  })
  return (await res.json()).id as string
}

/** Delete all transcripts matching a title prefix (ignores errors from already-deleted records). */
async function cleanup(request: any, prefix: string) {
  const res = await request.get('/api/transcripts')
  const transcripts = await res.json()
  for (const t of transcripts) {
    if (t.isOwner && t.title.startsWith(prefix)) {
      await request.delete(`/api/transcripts/${t.id}`).catch(() => {})
    }
  }
}

/** Get the card locator for a given title. */
function getCard(page: any, title: string) {
  return page.getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::div[contains(@class, "card")]').first()
}

// ─── Visibility toggle ──────────────────────────────────────────────────────

test.describe('Visibility toggle', () => {
  const TITLE = 'PW Visibility Test'

  test.beforeEach(async ({ request }) => { await cleanup(request, TITLE) })
  test.afterEach(async ({ request }) => { await cleanup(request, TITLE) })

  test('toggle transcript from private to public and back', async ({ page, request }) => {
    await createTranscript(request, TITLE)
    await page.goto('/')

    const card = getCard(page, TITLE)
    await expect(card.getByText('Private')).toBeVisible()

    await card.getByTitle('Make public').click()
    await expect(card.getByText('Public')).toBeVisible()

    await card.getByTitle('Make private').click()
    await expect(card.getByText('Private')).toBeVisible()
  })
})

// ─── Delete transcript ──────────────────────────────────────────────────────

test.describe('Delete transcript', () => {
  test.describe.configure({ mode: 'serial' })

  const CANCEL_TITLE = 'PW Delete Cancel'
  const CONFIRM_TITLE = 'PW Delete Confirm'

  test.beforeAll(async ({ request }) => {
    await cleanup(request, 'PW Delete')
  })
  test.afterAll(async ({ request }) => {
    await cleanup(request, 'PW Delete')
  })

  test('cancel delete keeps the transcript', async ({ page, request }) => {
    await createTranscript(request, CANCEL_TITLE)
    await page.goto('/')

    const card = getCard(page, CANCEL_TITLE)
    await card.getByTitle('Delete transcript').click()

    // Modal appears
    await expect(page.getByText('Delete transcript?')).toBeVisible()

    // Cancel → modal closes, transcript still there
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Delete transcript?')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: CANCEL_TITLE })).toBeVisible()
  })

  test('confirm delete removes the transcript', async ({ page, request }) => {
    await createTranscript(request, CONFIRM_TITLE)
    await page.goto('/')

    const card = getCard(page, CONFIRM_TITLE)
    await card.getByTitle('Delete transcript').click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByRole('heading', { name: CONFIRM_TITLE })).not.toBeVisible({ timeout: 5000 })
  })
})

// ─── Generate from YouTube (fake pipeline) ──────────────────────────────────

test.describe('Generate from YouTube', () => {
  test('submit YouTube URL and see pipeline progress UI', async ({ page }) => {
    await page.goto('/')

    // Open the generate form
    await page.getByRole('button', { name: 'Generate from YouTube' }).click()
    const urlInput = page.getByPlaceholder('https://www.youtube.com/watch?v=')
    await expect(urlInput).toBeVisible()

    // Submit a URL
    await urlInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await page.locator('form').getByRole('button', { name: 'Generate' }).click()

    // Should see the progress UI appear (regardless of which pipeline runs)
    await expect(page.locator('[class*="progressView"], [class*="doneView"], [class*="inlineError"]').first()).toBeVisible({ timeout: 15000 })
  })
})

// ─── Upload JSON ────────────────────────────────────────────────────────────

test.describe('Upload JSON', () => {
  const TITLE = 'PW Upload Test'

  test.afterEach(async ({ request }) => { await cleanup(request, TITLE) })

  test('upload a transcript analysis JSON and see it in the dashboard', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Upload JSON' }).click()
    await expect(page.getByText('Transcript Viewer')).toBeVisible()

    const tmpFile = path.join(import.meta.dirname, '..', `tmp-upload-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, JSON.stringify(makeSampleAnalysis(TITLE)))

    try {
      const fileChooserPromise = page.waitForEvent('filechooser')
      await page.getByText('Drop your JSON file here').click()
      const fileChooser = await fileChooserPromise
      await fileChooser.setFiles(tmpFile)

      // Should navigate to the Dashboard
      await expect(page.getByText('Overview')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(TITLE)).toBeVisible()
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})

// ─── View transcript ────────────────────────────────────────────────────────

test.describe('View transcript', () => {
  const TITLE = 'PW View Test'

  test.beforeEach(async ({ request }) => { await cleanup(request, TITLE) })
  test.afterEach(async ({ request }) => { await cleanup(request, TITLE) })

  test('open a transcript and see the dashboard tabs', async ({ page, request }) => {
    await createTranscript(request, TITLE)
    await page.goto('/')

    const card = getCard(page, TITLE)
    await card.getByRole('button', { name: 'Open' }).click()

    // Dashboard with all tabs
    await expect(page.getByText('Overview')).toBeVisible({ timeout: 10000 })
    for (const tab of ['Quotes', 'Insights', 'References', 'Debates', 'Timeline']) {
      await expect(page.getByText(tab)).toBeVisible()
    }

    // Content from the analysis
    await expect(page.getByText('A conversation about testing practices.')).toBeVisible()
    await expect(page.getByText('Alice (Host)')).toBeVisible()
  })

  test('navigate dashboard tabs', async ({ page, request }) => {
    await createTranscript(request, TITLE)
    await page.goto('/')

    const card = getCard(page, TITLE)
    await card.getByRole('button', { name: 'Open' }).click()
    await expect(page.getByText('Overview')).toBeVisible({ timeout: 10000 })

    // Use button role to target tab buttons specifically
    await page.getByRole('button', { name: /Quotes/ }).click()
    await expect(page.getByText('The best test is one that actually runs.')).toBeVisible()

    await page.getByRole('button', { name: /Insights/ }).click()
    await expect(page.getByText('E2E tests provide the highest confidence.')).toBeVisible()

    await page.getByRole('button', { name: /References/ }).click()
    await expect(page.getByText('Primary testing framework.')).toBeVisible()

    await page.getByRole('button', { name: /Timeline/ }).click()
    await expect(page.getByText('Why test')).toBeVisible()

    await page.getByRole('button', { name: /Debates/ }).click()
    await expect(page.getByText('Unit vs E2E tests')).toBeVisible()
  })

  test('navigate back to transcript list from dashboard', async ({ page, request }) => {
    await createTranscript(request, TITLE)
    await page.goto('/')

    const card = getCard(page, TITLE)
    await card.getByRole('button', { name: 'Open' }).click()
    await expect(page.getByText('Overview')).toBeVisible({ timeout: 10000 })

    await page.getByText('My Transcripts').click()
    await expect(page.locator('h1')).toContainText('My Transcripts')
  })
})
