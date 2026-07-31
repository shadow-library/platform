/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type RuntimeCachingRule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
/** Header stamped on cached responses so `maxAgeSeconds` freshness can be checked without extra bookkeeping. */
const TIMESTAMP_HEADER = 'x-shadow-sw-cached-at';

/** Fetch with an optional abort deadline (for `network-first`), always clearing the timer. */
async function fetchWithTimeout(request: Request, seconds?: number): Promise<Response> {
  if (!seconds) return fetch(request);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Return a copy of the response carrying a cache-time header; opaque/bodyless responses are stamped-through as-is. */
function stamp(response: Response): Response {
  if (response.type === 'opaque' || !response.body) return response;
  const headers = new Headers(response.headers);
  headers.set(TIMESTAMP_HEADER, Date.now().toString());
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isFresh(response: Response, maxAgeSeconds?: number): boolean {
  if (!maxAgeSeconds) return true;
  const cachedAt = Number(response.headers.get(TIMESTAMP_HEADER));
  if (!cachedAt) return true;
  return (Date.now() - cachedAt) / 1000 < maxAgeSeconds;
}

/** Evict oldest entries (Cache API preserves insertion order) down to the rule's `maxEntries` cap. */
async function trim(cache: Cache, maxEntries?: number): Promise<void> {
  if (!maxEntries) return;
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) await cache.delete(key);
}

/** Persist a response (skipping error responses), stamping it when the rule tracks age, then enforce the cap. */
async function save(cache: Cache, request: Request, response: Response, rule: RuntimeCachingRule): Promise<void> {
  if (!response.ok && response.type !== 'opaque') return;
  await cache.put(request, rule.maxAgeSeconds ? stamp(response) : response);
  await trim(cache, rule.maxEntries);
}

async function networkFirst(request: Request, cache: Cache, rule: RuntimeCachingRule): Promise<Response> {
  try {
    const response = await fetchWithTimeout(request, rule.networkTimeoutSeconds);
    await save(cache, request, response.clone(), rule);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request: Request, cache: Cache, rule: RuntimeCachingRule): Promise<Response> {
  const cached = await cache.match(request);
  if (cached && isFresh(cached, rule.maxAgeSeconds)) return cached;
  const response = await fetch(request);
  await save(cache, request, response.clone(), rule);
  return response;
}

async function staleWhileRevalidate(request: Request, cache: Cache, rule: RuntimeCachingRule): Promise<Response> {
  const revalidate = fetch(request).then(async response => {
    await save(cache, request, response.clone(), rule);
    return response;
  });
  const cached = await cache.match(request);
  if (cached && isFresh(cached, rule.maxAgeSeconds)) {
    void revalidate.catch(() => undefined);
    return cached;
  }
  return revalidate;
}

async function cacheOnly(request: Request, cache: Cache): Promise<Response> {
  return (await cache.match(request)) ?? Response.error();
}

/** Dispatch a request to the rule's caching strategy against its resolved cache. */
export async function runStrategy(request: Request, rule: RuntimeCachingRule, defaultCacheName: string): Promise<Response> {
  if (rule.strategy === 'network-only') return fetch(request);
  const cache = await caches.open(rule.cacheName ?? defaultCacheName);
  switch (rule.strategy) {
    case 'cache-first':
      return cacheFirst(request, cache, rule);
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, cache, rule);
    case 'cache-only':
      return cacheOnly(request, cache);
    default:
      return networkFirst(request, cache, rule);
  }
}
