import { defineConfig } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.join(import.meta.dirname, 'tests', '.auth', 'user.json')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
  ],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',
    launchOptions: {
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    },
  },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      url: 'http://localhost:3002/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
      env: { ...process.env, PORT: '3002', ALLOW_TEST_LOGIN: 'true', FRONTEND_URL: 'http://localhost:5174' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npx vite --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      env: { ...process.env, BACKEND_PORT: '3002' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
