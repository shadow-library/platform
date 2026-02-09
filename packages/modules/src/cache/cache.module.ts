/**
 * Importing npm packages
 */
import { DynamicModule, FactoryProvider, Module, ModuleMetadata, Provider } from '@shadow-library/app';
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
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

export interface CacheModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'>, Pick<FactoryProvider, 'inject'> {
  /** Factory function that returns CacheModuleOptions or a Promise resolving to it */
  useFactory: (...args: unknown[]) => Promisable<CacheModuleOptions>;
}

/**
 * Declaring the constants
 */

@Module()
export class CacheModule {
  static forRoot(options: CacheModuleOptions): DynamicModule {
    return this.forRootAsync({ useFactory: () => options });
  }

  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    const optionsProvider: FactoryProvider = { token: CACHE_MODULE_OPTIONS, useFactory: options.useFactory };
    if (options.inject) optionsProvider.inject = options.inject;
    const providers: Provider[] = [optionsProvider, CacheService, RedisCacheService, MemcacheService];
    const Module: DynamicModule = { module: CacheModule, providers, exports: [CacheService, RedisCacheService, MemcacheService] };
    if (options.imports) Module.imports = options.imports;
    return Module;
  }
}
