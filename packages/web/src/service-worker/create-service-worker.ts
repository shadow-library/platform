/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { SW_PROTOCOL, type SwEnvelope, type SwRequest, type SwResponse } from '../pwa/protocol';
import { runStrategy } from './strategies';
import { type RuntimeCachingRule, type ServiceWorkerConfig, type ServiceWorkerScope } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
function isEnvelope(data: unknown): data is SwEnvelope {
  return typeof data === 'object' && data !== null && (data as { channel?: unknown }).channel === SW_PROTOCOL;
}

function matchesRule(rule: RuntimeCachingRule, url: URL, request: Request): boolean {
  return typeof rule.pattern === 'function' ? rule.pattern(url, request) : rule.pattern.test(url.href);
}

/**
 * Install the Shadow service-worker runtime. Call it once from your worker entry (`src/sw.ts`), which your
 * bundler emits as the registered script:
 *
 * ```ts
 * import { createServiceWorker } from '@shadow-library/web/service-worker';
 * createServiceWorker({ navigationFallback: '/offline', precache: ['/offline'], runtimeCaching: [...] });
 * ```
 *
 * Caching is entirely runtime-driven (no build-time asset manifest), so the same worker fits any app. It
 * precaches the app shell, cleans up stale versioned caches on activate, applies the per-pattern
 * `runtimeCaching` rules (falling back to any cache offline — which transparently serves on-demand downloaded
 * content), and handles the client message protocol for downloading/removing offline content.
 */
export function createServiceWorker(config: ServiceWorkerConfig = {}): void {
  const scope = self as unknown as ServiceWorkerScope;
  const prefix = config.cachePrefix ?? 'shadow';
  const version = config.version ?? 'v1';
  const precacheName = `${prefix}-precache-${version}`;
  const runtimeName = `${prefix}-runtime-${version}`;
  // The offline-content cache is intentionally unversioned: a deploy that bumps `version` must not wipe what
  // the user explicitly downloaded for offline use.
  const offlineName = config.offlineCacheName ?? `${prefix}-offline`;
  const rules = config.runtimeCaching ?? [];
  const managedCaches = new Set([precacheName, runtimeName, offlineName]);

  scope.addEventListener('install', event => {
    event.waitUntil(
      (async () => {
        if (config.precache?.length) {
          const cache = await caches.open(precacheName);
          await cache.addAll(config.precache);
        }
        if (config.skipWaiting) await scope.skipWaiting();
      })(),
    );
  });

  scope.addEventListener('activate', event => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith(prefix) && !managedCaches.has(name)).map(name => caches.delete(name)));
        if (config.clientsClaim !== false) await scope.clients.claim();
      })(),
    );
  });

  scope.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    event.respondWith(handleFetch(event.request, url));
  });

  scope.addEventListener('message', event => {
    if (!isEnvelope(event.data)) return;
    event.waitUntil(handleMessage(event.data.request, event.ports[0] ?? null));
  });

  async function handleFetch(request: Request, url: URL): Promise<Response> {
    const rule = rules.find(candidate => matchesRule(candidate, url, request));
    if (rule) return runStrategy(request, rule, runtimeName).catch(() => matchAnyCache(request));

    const denied = (config.navigationFallbackDenylist ?? []).some(pattern => pattern.test(url.pathname));
    if (request.mode === 'navigate' && config.navigationFallback && !denied) {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(config.navigationFallback)) ?? Response.error();
      }
    }

    // Default: hit the network, but fall back to any cache when offline — this is what transparently serves
    // on-demand downloaded content (it lives in the offline cache under its own URL) with no per-route config.
    try {
      return await fetch(request);
    } catch {
      return matchAnyCache(request);
    }
  }

  async function matchAnyCache(request: Request): Promise<Response> {
    return (await caches.match(request)) ?? Response.error();
  }

  async function handleMessage(request: SwRequest, port: MessagePort | null): Promise<void> {
    try {
      if (request.type === 'cache-urls') {
        await cacheUrls(request.urls, request.cacheName ?? offlineName, port);
        return;
      }
      port?.postMessage(await processMessage(request));
    } catch (error) {
      port?.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) } satisfies SwResponse);
    }
  }

  async function processMessage(request: SwRequest): Promise<SwResponse> {
    switch (request.type) {
      case 'skip-waiting': {
        await scope.skipWaiting();
        return { type: 'done' };
      }
      case 'delete-cache': {
        await caches.delete(request.cacheName);
        return { type: 'done' };
      }
      case 'delete-urls': {
        const cache = await caches.open(request.cacheName ?? offlineName);
        await Promise.all(request.urls.map(url => cache.delete(url)));
        return { type: 'done' };
      }
      case 'list-urls': {
        const cache = await caches.open(request.cacheName ?? offlineName);
        const keys = await cache.keys();
        return { type: 'done', urls: keys.map(key => key.url) };
      }
      default:
        return { type: 'error', message: `Unsupported request: ${String((request as { type?: unknown }).type)}` };
    }
  }

  async function cacheUrls(urls: string[], cacheName: string, port: MessagePort | null): Promise<void> {
    const cache = await caches.open(cacheName);
    let completed = 0;
    for (const url of urls) {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok || response.type === 'opaque') await cache.put(url, response);
      completed += 1;
      port?.postMessage({ type: 'progress', completed, total: urls.length, url } satisfies SwResponse);
    }
    port?.postMessage({ type: 'done', cached: completed } satisfies SwResponse);
  }
}
