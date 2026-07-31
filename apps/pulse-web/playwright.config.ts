/**
 * Importing npm packages
 */
import { defineConfig, devices } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

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

  // TanStack Start serves through a Node/Bun SSR server (not `vite preview`); build once, then run it on 3000.
  webServer: {
    command: isCI ? 'PORT=3000 bun run start' : 'bun run build && PORT=3000 bun run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
