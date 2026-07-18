/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AsyncModuleOptions, createDynamicModule } from '../internal.utils';
import { CACHE_MODULE_OPTIONS } from './cache.constants';
import { CacheService } from './cache.service';
import { MemcacheService } from './memcache.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * Defining types
 */

export interface CacheModuleOptions {
  /** Maximum size of the in-memory LRU cache (default: 5000 items) */
  lruCacheSize?: number;

  /** Optional TTL (in seconds) for entries in the in-memory LRU cache */
  lruCacheTTLSeconds?: number;
}

export type CacheModuleAsyncOptions = AsyncModuleOptions<CacheModuleOptions>;

/**
 * Declaring the constants
 */

@Module()
export class CacheModule {
  static forRoot(options: CacheModuleOptions): DynamicModule {
    return this.forRootAsync({ useFactory: () => options });
  }

  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    return createDynamicModule(CacheModule, CACHE_MODULE_OPTIONS, options, [CacheService, RedisCacheService, MemcacheService]);
  }
}
