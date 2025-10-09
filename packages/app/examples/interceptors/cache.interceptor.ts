/**
 * Importing npm packages
 */
import { Promisable } from 'type-fest';

import { CallHandler, Injectable, Interceptor, InterceptorContext } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CacheService } from './cache.service';

/**
 * Defining types
 */

export interface CacheOptions {
  key: string;
  ttl?: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CacheInterceptor implements Interceptor {
  constructor(private readonly cacheService: CacheService) {}

  async handleAsync(key: string, ttl: number, handler: () => unknown): Promise<unknown> {
    const cachedValue = await this.cacheService.getAsync(key);
    if (cachedValue) return cachedValue;
    const result = await handler();
    await this.cacheService.setAsync(key, result, ttl);
    return result;
  }

  handleSync(key: string, ttl: number, handler: () => unknown): unknown {
    const cachedValue = this.cacheService.get(key);
    if (cachedValue) return cachedValue;
    const result = handler();
    this.cacheService.set(key, result, ttl);
    return result;
  }

  intercept(context: InterceptorContext, next: CallHandler): Promisable<unknown> {
    const options = context.getOptions<CacheOptions>() as CacheOptions;
    const { key, ttl = 1000 } = options;
    if (context.isPromise()) return this.handleAsync(key, ttl, next.handle);
    return this.handleSync(key, ttl, next.handle);
  }
}
