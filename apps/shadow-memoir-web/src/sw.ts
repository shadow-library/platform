import { createServiceWorker } from '@shadow-library/web/service-worker';

/**
 * The runtime-configured caching worker (emitted as `/sw.js` by vite.sw.config.ts). Shadow Memoir is a
 * single-user product with no public content, so nothing user-scoped may land in the on-disk Cache API:
 * every `/api` path is network-only and the durable local copy lives in IndexedDB instead, where the
 * offline layer owns its lifetime and account deletion can actually erase it. What is cached is the shell
 * and the hashed assets — enough for the app to open and render from local data with no network at all.
 */
createServiceWorker({
  cachePrefix: 'shadow-memoir',
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
