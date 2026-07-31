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

// Every route sits behind the backend session gate, so live-stack runs need a pre-established
// `nf-session` cookie. PW_STORAGE_STATE points at a storage-state JSON minted out-of-band (real
// OIDC login against the running identity + novel-forge-server pair); unset, tests run cookie-less.
const storageState = process.env.PW_STORAGE_STATE;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    ...(storageState ? { storageState } : {}),
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // TanStack Start serves through a Node SSR server (not `vite preview`); build once, then run it on 3000.
  // Self-hosting specs (e.g. tests/publish-panel.spec.ts, which runs its own app + mock API on high
  // ports) don't need it — PW_NO_WEBSERVER=1 skips it so a targeted run never touches port 3000.
  ...(process.env.PW_NO_WEBSERVER === '1'
    ? {}
    : {
        webServer: {
          command: isCI ? 'PORT=3000 bun run start' : 'bun run build && PORT=3000 bun run start',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !isCI,
          timeout: 180_000,
        },
      }),
});
