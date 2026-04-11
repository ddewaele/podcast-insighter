import { test as setup, expect } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.join(import.meta.dirname, '..', '.auth', 'user.json')

/**
 * Authenticate once via the test-login route and save the session state.
 * All tests reuse this stored session — no login per test.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('/api/auth/test-login')
  // The test-login route redirects to the frontend; wait for the homepage
  await expect(page.locator('h1')).toContainText('My Transcripts')
  await page.context().storageState({ path: AUTH_FILE })
})
