/**
 * Importing npm packages
 */
import { Promisable } from 'type-fest';

import { CallHandler, Injectable, Interceptor, InterceptorContext } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CacheService } from './cache.service';
import { LoggerService } from './logger.service';

/**
 * Defining types
 */

export type CacheKey = string | ((...args: any[]) => string);

export interface CacheOptions {
  key: CacheKey;
  ttl?: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CacheInterceptor implements Interceptor {
  constructor(
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
  ) {}

  async handleAsync(key: string, ttl: number, handler: () => unknown): Promise<unknown> {
    const cachedValue = await this.cacheService.getAsync(key);
    if (cachedValue) {
      this.loggerService.log(`Cache hit for key: ${key}`);
      return cachedValue;
    }

    this.loggerService.log(`Cache miss for key: ${key}, executing original method`);
    const result = await handler();
    await this.cacheService.setAsync(key, result, ttl);
    this.loggerService.log(`Caching result for key: ${key}, ttl: ${ttl}ms`);
    return result;
  }

  handleSync(key: string, ttl: number, handler: () => unknown): unknown {
    const cachedValue = this.cacheService.get(key);
    if (cachedValue) {
      this.loggerService.log(`Cache hit for key: ${key}`);
      return cachedValue;
    }

    this.loggerService.log(`Cache miss for key: ${key}, executing original method`);
    const result = handler();
    this.cacheService.set(key, result, ttl);
    this.loggerService.log(`Caching result for key: ${key}, ttl: ${ttl}ms`);
    return result;
  }

  intercept(context: InterceptorContext, next: CallHandler): Promisable<unknown> {
    const options = context.getOptions<CacheOptions>() as CacheOptions;
    const { key, ttl = 1000 } = options;
    const cacheKey = typeof key === 'function' ? key(...context.getArgs()) : key;
    if (context.isPromise()) return this.handleAsync(cacheKey, ttl, next.handle);
    return this.handleSync(cacheKey, ttl, next.handle);
  }
}
