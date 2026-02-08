/**
 * Importing npm packages
 */

import { Inject, Injectable } from '@shadow-library/app';
import { LRUCache, LRUCacheOptions, Logger, Nullable } from '@shadow-library/common';

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
}
