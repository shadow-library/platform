/**
 * Importing npm packages
 */
import { defineConfig, devices } from '@playwright/test';

/**
 * Declaring the constants
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Reuses the running dev server (which proxies /api to the identity backend on :8080); starts one
  // otherwise. The live-flow test needs the backend up for the login/init round-trip.
  webServer: {
    command: 'bun dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
