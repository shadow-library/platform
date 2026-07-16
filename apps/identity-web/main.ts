/// <reference types="bun" />
/**
 * Importing npm packages
 */
import { join } from 'node:path';

import { serve } from '@shadow-library/web/server-entry';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 *
 * The production server — static assets (immutable cache + gzip), SSR streaming, a backend-independent
 * liveness probe, and graceful drain — is the shared Bun server from `@shadow-library/web`. This entry
 * only points it at this app's build output; ports come from `PORT` / `HEALTH_PORT`.
 */
const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');
const SSR_ENTRY = new URL('./dist/server/server.js', import.meta.url);

await serve({ ssrEntry: SSR_ENTRY, clientDir: CLIENT_DIR });
