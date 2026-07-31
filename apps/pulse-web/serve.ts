/**
 * The production entry (`bun run serve.ts`, package.json `start`), now `serve` from
 * `@shadow-library/web/server-entry`: hashed client assets with immutable caching + gzip, streamed SSR,
 * a backend-independent `/healthz` liveness probe on its own port (`HEALTH_PORT`, default 3001), and
 * graceful drain on shutdown.
 *
 * The old hand-rolled SPA static server (index.html fallback for every unknown path) is gone — every
 * backend call now travels through TanStack Start server functions (`src/lib/apis/server-fetch.ts`,
 * driven by `API_ORIGIN`), so the browser only talks to this origin. The one exception is the interactive
 * `/api/auth/*` redirect flow (login/logout), which the deployment's ingress must route to pulse-server.
 */
import { fileURLToPath } from 'node:url';

import { serve } from '@shadow-library/web/server-entry';

await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
});
