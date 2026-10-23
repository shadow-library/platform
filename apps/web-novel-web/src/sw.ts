import { createServiceWorker } from '@shadow-library/web/service-worker';

/**
 * Chapters are cache-first (immutable per `contentHash`), catalog reads network-first, hashed assets cache-first. Per-user endpoints are network-only so
 * their PII never reaches the Cache API.
 * On a private deployment `/` redirects a signed-out visitor, so the worker installs only after sign-in; the shell's SSR state then lets the access gate pass offline.
 */
createServiceWorker({
  cachePrefix: 'webnovel',
  version: 'v1',
  precache: ['/'],
  navigationFallback: '/',
  navigationFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    { pattern: /\/api\/novels\/[^/]+\/chapters\/\d+$/, strategy: 'cache-first', maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
    { pattern: /\/api\/(library|me)(\/|\?|$)/, strategy: 'network-only' },
    { pattern: /\/api\/novels(\/|\?|$)/, strategy: 'network-first', networkTimeoutSeconds: 4, maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
    { pattern: /\/assets\//, strategy: 'cache-first', maxEntries: 300 },
    { pattern: /\.(?:svg|png|webp|woff2?)$/, strategy: 'cache-first', maxEntries: 100 },
  ],
});
