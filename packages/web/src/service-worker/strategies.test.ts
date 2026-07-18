/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { runStrategy } from './strategies';
import { type CacheStrategy, type RuntimeCachingRule } from './types';

/**
 * Declaring the constants
 *
 * In-memory fakes for the Cache Storage + `fetch` the strategies use — Bun's test runtime ships neither, so we
 * stub the globals to exercise the real caching logic (hit/miss/offline transitions) without a browser.
 */
class FakeCache {
  private readonly store = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    const cached = this.store.get(typeof request === 'string' ? request : request.url);
    return cached ? cached.clone() : undefined;
  }
  async put(request: Request | string, response: Response): Promise<void> {
    this.store.set(typeof request === 'string' ? request : request.url, response);
  }
  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map(url => new Request(url));
  }
  async delete(request: Request | string): Promise<boolean> {
    return this.store.delete(typeof request === 'string' ? request : request.url);
  }
}

const cacheRegistry = new Map<string, FakeCache>();
const fakeCaches = {
  open: async (name: string): Promise<FakeCache> => {
    const existing = cacheRegistry.get(name) ?? new FakeCache();
    cacheRegistry.set(name, existing);
    return existing;
  },
};

let fetchCalls = 0;
let fetchImpl: (request: Request) => Promise<Response>;

const URL_UNDER_TEST = 'https://api.test/data';
const request = (): Request => new Request(URL_UNDER_TEST);
const rule = (strategy: CacheStrategy, extra: Partial<RuntimeCachingRule> = {}): RuntimeCachingRule => ({ pattern: /./, strategy, ...extra });

beforeEach(() => {
  cacheRegistry.clear();
  fetchCalls = 0;
  (globalThis as { caches: unknown }).caches = fakeCaches;
  (globalThis as { fetch: unknown }).fetch = async (input: Request): Promise<Response> => {
    fetchCalls += 1;
    return fetchImpl(input);
  };
});

describe('runStrategy — network-first', () => {
  it('should return the network response and cache it when online', async () => {
    fetchImpl = async () => new Response('fresh', { status: 200 });
    const response = await runStrategy(request(), rule('network-first'), 'runtime');
    expect(await response.text()).toBe('fresh');
    const cached = await (await fakeCaches.open('runtime')).match(request());
    expect(await cached?.text()).toBe('fresh');
  });

  it('should fall back to the cache when the network fails', async () => {
    await (await fakeCaches.open('runtime')).put(request(), new Response('cached', { status: 200 }));
    fetchImpl = async () => {
      throw new Error('offline');
    };
    const response = await runStrategy(request(), rule('network-first'), 'runtime');
    expect(await response.text()).toBe('cached');
  });
});

describe('runStrategy — cache-first', () => {
  it('should serve a cache hit without touching the network', async () => {
    await (await fakeCaches.open('runtime')).put(request(), new Response('cached', { status: 200 }));
    fetchImpl = async () => new Response('network');
    const response = await runStrategy(request(), rule('cache-first'), 'runtime');
    expect(await response.text()).toBe('cached');
    expect(fetchCalls).toBe(0);
  });

  it('should fetch and cache on a miss', async () => {
    fetchImpl = async () => new Response('network', { status: 200 });
    const response = await runStrategy(request(), rule('cache-first'), 'runtime');
    expect(await response.text()).toBe('network');
    expect(fetchCalls).toBe(1);
  });
});

describe('runStrategy — stale-while-revalidate', () => {
  it('should return the cached value immediately when one exists', async () => {
    await (await fakeCaches.open('runtime')).put(request(), new Response('stale', { status: 200 }));
    fetchImpl = async () => new Response('fresh', { status: 200 });
    const response = await runStrategy(request(), rule('stale-while-revalidate'), 'runtime');
    expect(await response.text()).toBe('stale');
  });
});

describe('runStrategy — cache-only', () => {
  it('should return an error response when nothing is cached', async () => {
    fetchImpl = async () => new Response('network');
    const response = await runStrategy(request(), rule('cache-only'), 'runtime');
    expect(response.type === 'error' || response.status === 0).toBe(true);
    expect(fetchCalls).toBe(0);
  });
});
