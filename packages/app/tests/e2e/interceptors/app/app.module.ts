/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CacheInterceptor } from './cache.interceptor';
import { CacheService } from './cache.service';
import { CatService } from './cat.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  providers: [CatService, CacheService, CacheInterceptor],
  exports: [CatService],
})
export class AppModule {}
