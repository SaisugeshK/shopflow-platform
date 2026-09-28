import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run the real web app against a running backend (dev profile, mock providers, dev seed data).
 * Start the backend first (see README), then: npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // PW_CHANNEL=chrome uses an installed Chrome instead of the downloaded Chromium.
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL }, grep: /@mobile/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
