import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { loadDotEnv } from './lib';

/**
 * Re-imported in every Playwright worker, and Bun's startup-time `.env` auto-load does not reach forked workers (see `lib/load-env.ts`).
 * No `baseURL`: every product URL (`lib/env.ts`) is resolved per spec, and this workspace never starts a server — the target is already running.
 */
loadDotEnv(path.join(import.meta.dirname, '.env'));

const isCI = !!process.env.CI;

/** Identity specs that must never overlap with a copy of themselves — they flip state the whole deployment shares. */
const SERIAL_IDENTITY_SPECS = /tests[\\/]identity[\\/](federation|sms-otp|rate-limit|workload-identity)\.spec\.ts$/;

/** Pulse specs that assert deltas on a deployment-wide aggregate, so no copy of them may run beside another. */
const SERIAL_PULSE_SPECS = /tests[\\/]pulse[\\/]dashboard\.spec\.ts$/;

/** Every other pulse spec; they share one back-channel budget with identity, so they run at a capped width. */
const PULSE_SPECS = /tests[\\/]pulse[\\/].*\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  // `globalSetup` spawns the seed as a Bun subprocess because specs run under the node runner, which lacks Bun's argon2id hashing.
  globalSetup: './seed/global-setup.ts',
  globalTeardown: './seed/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  // CI gets one retry to absorb network jitter; locally a retry would hide real flake.
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [['list'], ['html', { outputFolder: 'test-results/html-report', open: 'never' }]],
  outputDir: 'test-results/artifacts',

  use: {
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // The k3d dev ingress serves a local-CA cert on *.shadow-apps.test.
    ignoreHTTPSErrors: true,
  },

  // `chromium` depends on `setup` (per-persona storage states from `tests/auth.setup.ts`) but carries no `storageState`: authenticated specs opt in
  // per test via `test.use({ storageState })` or `apiContext(product, persona)`.
  //
  // The `*-serial` projects hold specs that drive deployment-wide state no other spec may observe mid-flight: one worker and no in-file parallelism,
  // so even `--repeat-each` copies run one after another, which `test.describe.configure({ mode: 'serial' })` alone does not guarantee.
  // identity: a global auth mode, a per-IP rate-limit budget, the namespace of Kubernetes workload-subject bindings.
  // pulse: `GET /api/v1/dashboard/stats` aggregates every notification job, so a second copy would move the counts the first asserts deltas on.
  //
  // The rest of pulse runs at two workers: pulse-server's back-channel calls to identity (app session, token, every permission decision) all arrive from
  // one pod address and spend identity's per-IP `GENERAL_LIMIT` (100/min). Exhausting it yields 429, surfaced as a 503 login or, fail-closed, a 403.
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: [/.*\.setup\.ts/, SERIAL_IDENTITY_SPECS, PULSE_SPECS] },
    { name: 'identity-serial', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: SERIAL_IDENTITY_SPECS, workers: 1, fullyParallel: false },
    { name: 'pulse', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: PULSE_SPECS, testIgnore: SERIAL_PULSE_SPECS, workers: 2 },
    { name: 'pulse-serial', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: SERIAL_PULSE_SPECS, workers: 1, fullyParallel: false },
  ],
});
