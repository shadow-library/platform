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
 * Every product URL (`lib/env.ts`) defaults to the local k3d dev ingress and is resolved per spec, not
 * from a single `baseURL` — this workspace never starts a server itself: whether that's the local k3d
 * cluster or a deployed environment reached via an env override, it's already running.
 */
loadDotEnv(path.join(import.meta.dirname, '.env'));

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // Seed the dev cluster's Postgres before anything runs, and drain DB clients after. `globalSetup` spawns the
  // seed as a Bun subprocess (specs run under the node runner, which lacks Bun's argon2id hashing); it completes
  // synchronously so the seed manifest exists before the auth-setup project logs anyone in.
  globalSetup: './seed/global-setup.ts',
  globalTeardown: './seed/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  // Unconditional retries would hide real local flake; CI still gets one to absorb network jitter.
  retries: isCI ? 1 : 0,
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
    // The k3d dev ingress presents a self-signed/local-CA cert on *.shadow-apps.test — not a production
    // trust concern, since every target here is either that local cluster or an env-overridden URL the
    // caller explicitly chose.
    ignoreHTTPSErrors: true,
  },

  // The `setup` project produces the per-persona storage states (`tests/auth.setup.ts`); `chromium` depends on it
  // so those files exist before an authenticated spec reads one. `chromium` carries no `storageState` of its own —
  // the existing specs assert the unauthenticated experience, and authenticated specs opt in per-test (via
  // `test.use({ storageState })` or `apiContext(product, persona)`).
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: /.*\.setup\.ts/ },
  ],
});
