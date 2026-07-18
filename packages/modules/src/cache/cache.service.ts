/**
 * Importing npm packages
 */

import { Promisable } from 'type-fest';
import { Inject, Injectable } from '@shadow-library/app';
import { Logger, LRUCache, LRUCacheOptions, Nullable } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { CACHE_MODULE_OPTIONS, LOGGER_NAMESPACE } from './cache.constants';
import { type CacheModuleOptions } from './cache.module';
import { MemcacheService } from './memcache.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * Defining types
 */

export interface ICacheStore {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, amount?: number): Promise<number>;
  decr(key: string, amount?: number): Promise<number>;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CacheService {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'CacheService');

  private readonly lruCache: LRUCache;
  private readonly cacheStore: ICacheStore;
  private readonly inflight = new Map<string, Promise<any>>();

  constructor(
    private readonly memcacheService: MemcacheService,
    private readonly redisCacheService: RedisCacheService,
    @Inject(CACHE_MODULE_OPTIONS) options: CacheModuleOptions,
  ) {
    const lruOptions: LRUCacheOptions = {};
    if (options.lruCacheTTLSeconds) lruOptions.ttl = options.lruCacheTTLSeconds * 1000;
    this.lruCache = new LRUCache(options.lruCacheSize ?? 5_000, lruOptions);

    if (this.memcacheService.isEnabled()) {
      this.cacheStore = this.memcacheService;
      this.logger.info('using Memcached as L2 cache store');
    } else {
      this.cacheStore = this.redisCacheService;
      this.logger.info('using Redis as L2 cache store');
    }
  }

  /** Retrieves data by key. Checks L1 (In-Memory). On miss, checks L2 (Memcached or Redis fallback) and hydrates L1 if found */
  async get<T = any>(key: string): Promise<T | null> {
    let value: Nullable<T> = this.lruCache.get<T>(key);
    if (value !== undefined) {
      this.logger.debug(`L1 cache hit for key: ${key}`, { value });
      return value;
    }
    this.logger.debug(`L1 cache miss for key: ${key}`);

    value = await this.cacheStore.get<T>(key);
    if (value !== null && value !== undefined) {
      this.logger.debug(`L2 cache hit for key: ${key}`, { value });
      this.lruCache.set(key, value);
      this.logger.debug(`L1 cache set for key: ${key}`, { value });
      return value;
    }

    this.logger.debug(`cache miss for key: ${key}`);
    return null;
  }

  /** Writes data to both L1 (In-Memory) and L2 (Memcached or Redis fallback) with an optional Time-To-Live */
  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.lruCache.set(key, value);
    this.logger.debug(`L1 cache set for key: ${key}`, { value });
    await this.cacheStore.set(key, value, ttlSeconds);
    this.logger.debug(`L2 cache set for key: ${key}`, { value, ttlSeconds });
  }

  /** Deletes the key from both L1 (In-Memory) and L2 (Memcached or Redis fallback) */
  async del(key: string): Promise<void> {
    this.lruCache.remove(key);
    this.logger.debug(`L1 cache deleted for key: ${key}`);
    await this.cacheStore.del(key);
    this.logger.debug(`L2 cache deleted for key: ${key}`);
  }

  /**
   * Returns the cached value for the key, computing and caching it via the factory on a miss.
   * Concurrent calls for the same key share a single factory invocation (cache-stampede protection).
   * Nullish factory results are returned but not cached, so they are recomputed on the next call.
   */
  async getOrSet<T = any>(key: string, factory: () => Promisable<T>, ttlSeconds?: number): Promise<T> {
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    /*! A factory for this key may have started while the cache read was awaited */
    const started = this.inflight.get(key) as Promise<T> | undefined;
    if (started) return started;

    const compute = (async () => {
      try {
        const value = await factory();
        if (value !== null && value !== undefined) await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, compute);
    this.logger.debug(`computing value for key: ${key}`);
    return compute;
  }

  /** Atomically increments a counter in the L2 store, dropping the L1 copy so subsequent reads stay consistent */
  async incr(key: string, amount = 1): Promise<number> {
    this.lruCache.remove(key);
    return this.cacheStore.incr(key, amount);
  }

  /** Atomically decrements a counter in the L2 store, dropping the L1 copy so subsequent reads stay consistent */
  async decr(key: string, amount = 1): Promise<number> {
    this.lruCache.remove(key);
    return this.cacheStore.decr(key, amount);
  }
}
