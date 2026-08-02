import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL?.replace(/\/$/, '');
if (!baseURL) {
  throw new Error('BASE_URL is required (e.g. https://your-staging-hostname.azurestaticapps.net)');
}

/**
 * Post-deploy smoke against a live environment (staging).
 * Desktop + mobile Chromium projects; public routes only.
 */
export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // SWA can take a short time to serve the new deployment.
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
