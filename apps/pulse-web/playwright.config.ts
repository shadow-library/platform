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
  //
  // The readiness probe targets the health port, not the app port: `GET /` runs the `requireSession`
  // auth gate server-side (see src/lib/session.ts), and with no backend reachable that gate's fetch fails
  // with a network error (not a 401), which propagates to the root error boundary and answers `/` with a
  // `500` — a real, fully server-rendered page, but not a 2xx, so Playwright's own "is the server up" GET
  // (`isURLAvailable`, playwright-core/lib/server/utils/network.js) never succeeds against `/` without a
  // backend. `/healthz` is backend-independent by design (`@shadow-library/web/server-entry`) and always
  // answers `200`, so it's the right target for "is the process up", leaving `/`'s actual status/content
  // for the specs themselves to assert on.
  webServer: {
    command: isCI ? 'PORT=3000 HEALTH_PORT=3001 bun run start' : 'bun run build && PORT=3000 HEALTH_PORT=3001 bun run start',
    url: 'http://localhost:3001/healthz',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
