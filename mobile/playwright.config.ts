import { defineConfig, devices } from '@playwright/test'

/**
 * Mobile E2E (Stage 5): drives the app's browser build (Expo web, react-native-web) on a phone-sized viewport against a
 * running backend (dev profile, mock providers, dev seed data). The same screens and API calls run on iOS/Android.
 * Start the backend first (see README), then: npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // PW_CHANNEL=chrome uses an installed Chrome instead of the downloaded Chromium.
    { name: 'phone', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
