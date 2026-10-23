import { createServiceWorker } from '@shadow-library/web/service-worker';

/**
 * Emitted as `/sw.js` by vite.sw.config.ts. Nothing user-scoped may land in the on-disk Cache API: every `/api` path is network-only and the durable local copy
 * lives in IndexedDB, where the offline layer owns its lifetime and account deletion can erase it. Only the shell and hashed assets are cached.
 */
createServiceWorker({
  cachePrefix: 'memoir',
  version: 'v1',
  precache: ['/'],
  navigationFallback: '/',
  navigationFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    { pattern: /^\/api\//, strategy: 'network-only' },
    { pattern: /\/assets\//, strategy: 'cache-first', maxEntries: 300 },
    { pattern: /\.(?:svg|png|webp|woff2?)$/, strategy: 'cache-first', maxEntries: 100 },
  ],
});
