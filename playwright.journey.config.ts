import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL?.replace(/\/$/, '');
if (!baseURL) {
  throw new Error('BASE_URL is required (e.g. https://your-staging-hostname.azurestaticapps.net)');
}

/**
 * Post-deploy journey tests against a live environment (staging).
 * Desktop: full persona suite. Mobile: tests tagged @mobile only.
 */
export default defineConfig({
  testDir: './tests/journeys',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'] },
    },
  ],
});
