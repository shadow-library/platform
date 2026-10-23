/// <reference types="bun" />

import { join } from 'node:path';

import { serve } from '@shadow-library/web/server-entry';

/** Serving (assets, SSR streaming, `/sw.js` headers, manifest type, liveness, drain) is the shared server in `@shadow-library/web`; ports come from `PORT` / `HEALTH_PORT`. */
const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');
const SSR_ENTRY = new URL('./dist/server/server.js', import.meta.url);

await serve({ ssrEntry: SSR_ENTRY, clientDir: CLIENT_DIR });
