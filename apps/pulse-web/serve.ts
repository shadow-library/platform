import { fileURLToPath } from 'node:url';

import { serve } from '@shadow-library/web/server-entry';

// No /api proxy: the ingress routes /api/* to pulse-server and everything else here, so browser calls stay same-origin; SSR reaches pulse-server directly.
await serve({
  ssrEntry: new URL('./dist/server/server.js', import.meta.url),
  clientDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
});
