/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type CacheStrategy = 'network-first' | 'cache-first' | 'stale-while-revalidate' | 'network-only' | 'cache-only';

export interface RuntimeCachingRule {
  /** A `RegExp` tested against the full request URL, or a predicate over the parsed URL and request. */
  pattern: RegExp | ((url: URL, request: Request) => boolean);
  strategy: CacheStrategy;
  /** Cache to read/write. Defaults to the shared runtime cache. */
  cacheName?: string;
  /** For `network-first`: fall back to cache if the network doesn't answer within this many seconds. */
  networkTimeoutSeconds?: number;
  /** Cap the cache to this many entries (oldest evicted first). */
  maxEntries?: number;
  /** Treat a cached entry older than this as stale (revalidated or bypassed). */
  maxAgeSeconds?: number;
}

export interface ServiceWorkerConfig {
  /** Prefix for every cache this worker owns, so its caches are namespaced and cleanable. @default 'shadow' */
  cachePrefix?: string;
  /** Bump to invalidate versioned caches on deploy — old ones are dropped on `activate`. @default 'v1' */
  version?: string;
  /** URLs cached on install (the app shell). Include your `navigationFallback` here so offline navigation works. */
  precache?: string[];
  /** URL served for navigations when the network is unavailable (e.g. an `/offline` route or `/index.html`). */
  navigationFallback?: string;
  /** Navigation paths that should never use the fallback (bypass the worker, e.g. `/api`, auth callbacks). */
  navigationFallbackDenylist?: RegExp[];
  /** Per-pattern runtime caching rules, evaluated in order; the first match wins. */
  runtimeCaching?: RuntimeCachingRule[];
  /** Cache holding on-demand downloaded content. Not version-suffixed, so downloads survive worker updates. */
  offlineCacheName?: string;
  /** Activate a new worker as soon as it installs, without waiting. @default false (prompt-then-reload) */
  skipWaiting?: boolean;
  /** Take control of open pages on first activation. @default true */
  clientsClaim?: boolean;
}

/**
 * Minimal `ServiceWorkerGlobalScope` surface, declared locally so this file type-checks under the package's
 * single `DOM`-lib tsconfig — pulling in the `WebWorker` lib alongside `DOM` produces duplicate-global errors.
 * `self` is cast to this shape inside {@link createServiceWorker} rather than redeclared.
 */
export interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

export interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

export interface ExtendableMessageEventLike extends ExtendableEventLike {
  readonly data: unknown;
  readonly ports: readonly MessagePort[];
}

export interface ServiceWorkerScope {
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: ExtendableMessageEventLike) => void): void;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
}
