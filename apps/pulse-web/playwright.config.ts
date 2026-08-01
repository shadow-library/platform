/**
 * Importing user defined packages
 */
import { createPlaywrightConfig } from '../../scripts/config/playwright.factory.ts';

const isCI = !!process.env.CI;

/**
 * TanStack Start serves through a Node/Bun SSR server (not `vite preview`); build once, then run it on 3000.
 *
 * The readiness probe targets the health port, not the app port: `GET /` runs the `requireSession`
 * auth gate server-side (see src/lib/session.ts), and with no backend reachable that gate's fetch fails
 * with a network error (not a 401), which propagates to the root error boundary and answers `/` with a
 * `500` — a real, fully server-rendered page, but not a 2xx, so Playwright's own "is the server up" GET
 * (`isURLAvailable`, playwright-core/lib/server/utils/network.js) never succeeds against `/` without a
 * backend. `/healthz` is backend-independent by design (`@shadow-library/web/server-entry`) and always
 * answers `200`, so it's the right target for "is the process up", leaving `/`'s actual status/content
 * for the specs themselves to assert on.
 */
export default createPlaywrightConfig({
  baseURL: 'http://localhost:3000',
  webServer: {
    command: isCI ? 'PORT=3000 HEALTH_PORT=3001 bun run start' : 'bun run build && PORT=3000 HEALTH_PORT=3001 bun run start',
    url: 'http://localhost:3001/healthz',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
