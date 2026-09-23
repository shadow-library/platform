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

/** Identity specs that must never overlap with a copy of themselves — they flip state the whole deployment shares. */
const SERIAL_IDENTITY_SPECS = /tests[\\/]identity[\\/](federation|sms-otp|rate-limit|workload-identity)\.spec\.ts$/;

/** Pulse specs that assert deltas on a deployment-wide aggregate, so no copy of them may run beside another. */
const SERIAL_PULSE_SPECS = /tests[\\/]pulse[\\/]dashboard\.spec\.ts$/;

/** Every other pulse spec; they share one back-channel budget with identity, so they run at a capped width. */
const PULSE_SPECS = /tests[\\/]pulse[\\/].*\.spec\.ts$/;

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
  //
  // `identity-serial` holds the specs that drive identity-wide state no other spec may observe mid-flight — a global
  // auth mode, a per-IP rate-limit budget, the deployment-wide namespace of Kubernetes workload-subject bindings. One
  // worker and no in-file parallelism means even `--repeat-each` copies of the same test run one after another, which
  // `test.describe.configure({ mode: 'serial' })` alone does not guarantee. `pulse-serial` holds the one pulse spec
  // with the same problem: `GET /api/v1/dashboard/stats` aggregates every notification job in the deployment, so a
  // second copy queueing its own rows would move the counts the first one is asserting a delta on.
  //
  // The rest of pulse runs in its own `pulse` project at two workers. Everything pulse-server does for a signed-in
  // caller — opening an app session, minting its token, every permission decision — is a back-channel call to
  // identity, and all of them arrive from the one pod address, so what they spend is identity's per-IP general
  // budget (`GENERAL_LIMIT`, 100 a minute, `security.constants.ts`) rather than the far roomier per-client M2M one.
  // A handful of concurrent sessions exhausts it, and identity then answers 429 — which pulse surfaces as a 503
  // login or, fail-closed, a 403 on a route the caller is entitled to.
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: [/.*\.setup\.ts/, SERIAL_IDENTITY_SPECS, PULSE_SPECS] },
    { name: 'identity-serial', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: SERIAL_IDENTITY_SPECS, workers: 1, fullyParallel: false },
    { name: 'pulse', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: PULSE_SPECS, testIgnore: SERIAL_PULSE_SPECS, workers: 2 },
    { name: 'pulse-serial', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: SERIAL_PULSE_SPECS, workers: 1, fullyParallel: false },
  ],
});
