/**
 * Deliberately does not proxy `/api`: the ingress routes `/api/*` on this origin to synapse-server, which keeps the browser's calls
 * same-origin for the session cookie and the CSRF double-submit. SSR reaches synapse-server directly at `API_ORIGIN`.
 */
import { fileURLToPath } from 'node:url';

import { serve } from '@shadow-library/web/server-entry';

await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
});
