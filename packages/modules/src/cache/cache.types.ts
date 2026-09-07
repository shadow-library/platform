/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type AsyncModuleOptions } from '../internal.utils';

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

export interface CacheModuleOptions {
  /** Maximum size of the in-memory LRU cache (default: 5000 items) */
  lruCacheSize?: number;

  /** Optional TTL (in seconds) for entries in the in-memory LRU cache */
  lruCacheTTLSeconds?: number;
}

export type CacheModuleAsyncOptions = AsyncModuleOptions<CacheModuleOptions>;
