/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class CacheService {
  private readonly cache = new Map<string, any>();

  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  async getAsync<T>(key: string): Promise<T | undefined> {
    await Bun.sleep(10);
    return this.cache.get(key);
  }

  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value);
    if (ttl) setTimeout(() => this.cache.delete(key), ttl);
  }

  async setAsync<T>(key: string, value: T, ttl?: number): Promise<void> {
    await Bun.sleep(10);
    this.cache.set(key, value);
    if (ttl) setTimeout(() => this.cache.delete(key), ttl);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}
