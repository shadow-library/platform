/// <reference types="bun" />
/**
 * Importing npm packages
 */
import { join } from 'node:path';

import { Logger, Config } from '@shadow-library/common';
import { serve } from '@shadow-library/web/server-entry';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */
if (Config.isProd()) Logger.attachTransport('console:json');
else if (Config.isDev()) Logger.attachTransport('console:pretty').attachTransport('file:json');

const CLIENT_DIR = join(import.meta.dir, 'dist', 'client');
const SSR_ENTRY = new URL('./dist/server/server.js', import.meta.url);
await serve({ ssrEntry: SSR_ENTRY, clientDir: CLIENT_DIR });
