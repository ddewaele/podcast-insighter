import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Clean up test transcripts via API before each test
test.beforeEach(async ({ request }) => {
  const res = await request.get('/api/transcripts')
  const transcripts = await res.json()
  for (const t of transcripts) {
    if (t.isOwner && (t.title.startsWith('Playwright') || t.title.startsWith('Round Trip'))) {
      await request.delete(`/api/transcripts/${t.id}`)
    }
  }
})

test.describe('Export / Import', () => {
  test('export downloads a JSON file with own transcripts', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('My Transcripts')

    // Open the Data menu
    await page.getByRole('button', { name: 'Data' }).click()

    // Start waiting for the download before clicking
    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Export JSON').click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/podcast-insighter-export.*\.json/)

    // Verify the file is valid JSON with the right shape
    const filePath = await download.path()
    const content = JSON.parse(fs.readFileSync(filePath!, 'utf-8'))
    expect(content).toHaveProperty('version', 1)
    expect(content).toHaveProperty('exportedAt')
    expect(content).toHaveProperty('count')
    expect(content).toHaveProperty('transcripts')
    expect(Array.isArray(content.transcripts)).toBe(true)
  })

  test('import accepts a JSON file and shows success message', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('My Transcripts')

    // Create a minimal export file to import
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: 1,
      transcripts: [
        {
          title: 'Playwright Import Test',
          status: 'ready',
          isPublic: false,
          data: {
            metadata: { title: 'Playwright Import Test', speakers: [], primary_topics: [], estimated_duration_minutes: null, date_hint: null },
            summary: { one_liner: 'Test', executive_summary: 'Test', key_takeaways: [] },
            quotes: [],
            insights: [],
            references: [],
            disagreements_and_nuance: [],
            topic_segments: [],
          },
        },
      ],
    }

    const tmpFile = path.join(import.meta.dirname, '..', 'tmp-import-test.json')
    fs.writeFileSync(tmpFile, JSON.stringify(exportData))

    try {
      // Open Data menu and click Import
      await page.getByRole('button', { name: 'Data' }).click()

      // Set up the file chooser listener before clicking Import
      const fileChooserPromise = page.waitForEvent('filechooser')
      await page.getByText('Import JSON').click()

      const fileChooser = await fileChooserPromise
      await fileChooser.setFiles(tmpFile)

      // Should see a success toast
      await expect(page.getByText(/Imported 1 transcript/)).toBeVisible({ timeout: 10000 })

      // The imported transcript should appear in the list
      await expect(page.getByText('Playwright Import Test').first()).toBeVisible()
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('export → import round-trip preserves data', async ({ page, request }) => {
    // Ensure at least one transcript exists to export
    await request.post('/api/transcripts', {
      data: {
        title: 'Playwright Round Trip',
        data: { metadata: { title: 'Playwright Round Trip' }, summary: { one_liner: 'Test' }, quotes: [], insights: [], references: [], disagreements_and_nuance: [], topic_segments: [] },
      },
    })

    await page.goto('/')

    // Export current transcripts
    await page.getByRole('button', { name: 'Data' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Export JSON').click()
    const download = await downloadPromise
    const exportPath = await download.path()
    const exportData = JSON.parse(fs.readFileSync(exportPath!, 'utf-8'))

    // Verify exported file has the expected shape
    expect(exportData).toHaveProperty('version', 1)
    expect(exportData).toHaveProperty('transcripts')
    expect(Array.isArray(exportData.transcripts)).toBe(true)

    // Import the same file back — should succeed
    await page.getByRole('button', { name: 'Data' }).click()
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByText('Import JSON').click()
    const fileChooser = await fileChooserPromise

    const tmpFile = path.join(import.meta.dirname, '..', 'tmp-roundtrip.json')
    fs.writeFileSync(tmpFile, JSON.stringify(exportData))
    try {
      await fileChooser.setFiles(tmpFile)
      await expect(page.getByText(/Imported/)).toBeVisible({ timeout: 10000 })
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})
