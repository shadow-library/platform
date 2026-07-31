/**
 * Importing npm packages
 */
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { loadDotEnv } from './lib';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * This file is re-imported in every Playwright worker process, so loading `.env` here — rather than
 * relying on Bun's own startup-time auto-load, which does not reach forked workers (see `lib/load-env.ts`)
 * — reliably lands the vars before any spec reads them.
 *
 * There is no local compose deployment (see `AGENTS.md`), so there is no `webServer` and no single
 * `baseURL`: each spec resolves its own product URL from `lib/env.ts` and skips cleanly when unset.
 */
loadDotEnv(path.join(import.meta.dirname, '.env'));

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 1,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // Both reporters write under `test-results/`, which the root `.gitignore` already excludes at any depth.
  reporter: [['list'], ['html', { outputFolder: 'test-results/html-report', open: 'never' }]],
  outputDir: 'test-results/artifacts',

  use: {
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
