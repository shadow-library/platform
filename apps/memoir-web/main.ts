/// <reference types="bun" />

import { join } from 'node:path';

import { serve } from '@shadow-library/web/server-entry';

/** The shared Bun server from `@shadow-library/web` does the serving; this entry only points it at the build output. Ports come from `PORT` / `HEALTH_PORT`. */
const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');
const SSR_ENTRY = new URL('./dist/server/server.js', import.meta.url);

await serve({ ssrEntry: SSR_ENTRY, clientDir: CLIENT_DIR });
