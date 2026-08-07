/**
 * This server deliberately does not proxy `/api`. The deployment fronts it with an ingress that routes
 * `/api/*` to novel-forge-server and everything else here, on one origin — which is what makes the
 * browser's API calls same-origin, so its cookies and the CSRF double-submit work without a proxy hop
 * through this process. SSR reaches novel-forge-server directly at `API_ORIGIN`, bypassing the ingress.
 */
import { fileURLToPath } from 'node:url';

import { serve } from '@shadow-library/web/server-entry';

await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
});
