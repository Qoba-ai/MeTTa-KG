import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  timeout: 90_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3001',
    // Run headed so Claude (and the developer) can watch the test live.
    // Override with HEADLESS=1 for CI: HEADLESS=1 npx playwright test
    headless: process.env.HEADLESS === '1',
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
    video: 'on',
    screenshot: 'on',
    trace: 'on',
    actionTimeout: 15_000,
  },
})
