/**
 * The production entry (`bun run serve.ts`, package.json `start`), now `serve` from
 * `@shadow-library/web/server-entry`: hashed client assets with immutable caching + gzip, streamed SSR,
 * a backend-independent `/healthz` liveness probe on its own port (`HEALTH_PORT`, default 3001), and
 * graceful drain on shutdown.
 *
 * This server deliberately does not proxy `/api`. The deployment fronts it with an ingress that routes
 * `/api/*` to pulse-server and everything else here, on one origin — which is what makes the browser's API
 * calls same-origin, so its cookies and the CSRF double-submit work without a proxy hop through this
 * process. SSR reaches pulse-server directly at `API_ORIGIN`, bypassing the ingress entirely.
 */
import { fileURLToPath } from 'node:url';

import { serve } from '@shadow-library/web/server-entry';

await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
});
