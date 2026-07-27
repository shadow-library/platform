/**
 * Importing npm packages
 */
import { createServiceWorker } from '@shadow-library/web/service-worker';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The runtime-configured caching worker (emitted as `/sw.js` by vite.sw.config.ts). Chapter content is
 * immutable per `contentHash`, so it is cache-first — anything previously read stays readable offline;
 * catalog reads are network-first with a cached fallback; hashed client assets are cache-first. Offline
 * navigations fall back to the precached shell and the client router + persisted query cache take over.
 */
createServiceWorker({
  cachePrefix: 'webnovel',
  version: 'v1',
  precache: ['/'],
  navigationFallback: '/',
  navigationFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    { pattern: /\/api\/novels\/[^/]+\/chapters\/\d+$/, strategy: 'cache-first', maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
    { pattern: /\/api\/(novels|library|me)(\/|\?|$)/, strategy: 'network-first', networkTimeoutSeconds: 4, maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
    { pattern: /\/assets\//, strategy: 'cache-first', maxEntries: 300 },
    { pattern: /\.(?:svg|png|webp|woff2?)$/, strategy: 'cache-first', maxEntries: 100 },
  ],
});
