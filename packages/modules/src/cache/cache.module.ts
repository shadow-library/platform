/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { createDynamicModule } from '../internal.utils';
import { CACHE_MODULE_OPTIONS } from './cache.constants';
import { CacheService } from './cache.service';
import { type CacheModuleAsyncOptions, type CacheModuleOptions } from './cache.types';
import { MemcacheService } from './memcache.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * Defining types
 */

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
