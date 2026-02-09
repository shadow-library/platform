/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger, MaybeNull, NeverError } from '@shadow-library/common';
import type Memcached from 'memcached';

/**
 * Importing user defined packages
 */
import { LOGGER_NAMESPACE } from './cache.constants';
import { type ICacheStore } from './cache.service';
import { DatabaseService } from '../database/database.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class MemcacheService implements ICacheStore {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'MemcacheService');

  private readonly memcached?: Memcached;

  constructor(databaseService: DatabaseService) {
    if (databaseService.isMemcacheEnabled()) {
      this.memcached = databaseService.getMemcacheClient();
      this.logger.info('Memcached client initialized successfully');
    } else this.logger.warn('Memcached not enabled in DatabaseModule, MemcacheService will be inactive');
  }

  isEnabled(): boolean {
    return this.memcached !== undefined;
  }

  /** Retrieves data exclusively from Memcached */
  async get<T = any>(key: string): Promise<MaybeNull<T>> {
    if (!this.memcached) return null;
    return new Promise<MaybeNull<T>>((resolve, reject) => {
      this.memcached?.get(key, (err, data) => {
        if (err) return reject(err);
        if (data === undefined) this.logger.debug(`cache miss for key: ${key}`);
        else this.logger.debug(`cache hit for key: ${key}`, { value: data });
        resolve(data ?? null);
      });
    });
  }

  /** Stores data exclusively in Memcached */
  async set<T = any>(key: string, value: T, ttlSeconds = 0): Promise<void> {
    if (!this.memcached) return;
    return new Promise<void>((resolve, reject) => {
      this.memcached?.set(key, value, ttlSeconds, err => {
        if (err) return reject(err);
        this.logger.debug(`cache set for key: ${key}`, { value, lifetime: ttlSeconds });
        resolve();
      });
    });
  }

  /** Deletes data exclusively from Memcached */
  async del(key: string): Promise<void> {
    if (!this.memcached) return;
    return new Promise<void>((resolve, reject) => {
      this.memcached?.del(key, err => {
        if (err) return reject(err);
        this.logger.debug(`cache deleted for key: ${key}`);
        resolve();
      });
    });
  }

  /** Increments a numeric value exclusively in Memcached, initializing if not found */
  async incr(key: string, amount = 1): Promise<number> {
    if (!this.memcached) throw new Error('Memcached client not initialized');
    return new Promise<number>((resolve, reject) => {
      this.memcached?.incr(key, amount, (err, result) => {
        if (err) return reject(err);

        if (typeof result === 'number') {
          resolve(result);
          this.logger.debug(`cache incremented for key: ${key}`, { amount, value: result });
          return;
        }

        if (result === false) {
          this.logger.debug(`Memcached key not found for increment, initializing key: ${key} with value: ${amount}`);
          return this.set(key, amount, 0)
            .then(() => resolve(amount))
            .catch(reject);
        }

        this.logger.error(`Unexpected value returned from Memcached increment for key: ${key}`, { value: result });
        return reject(new NeverError(`Unexpected value returned from Memcached increment for key '${key}': ${result}`));
      });
    });
  }

  /** Decrements a numeric value exclusively in Memcached, initializing if not found */
  async decr(key: string, amount = 1): Promise<number> {
    if (!this.memcached) throw new Error('Memcached client not initialized');
    return new Promise<number>((resolve, reject) => {
      this.memcached?.decr(key, amount, (err, result) => {
        if (err) return reject(err);

        if (typeof result === 'number') {
          resolve(result);
          this.logger.debug(`cache decremented for key: ${key}`, { amount, value: result });
          return;
        }

        if (result === false) {
          this.logger.debug(`Memcached key not found for decrement, initializing key: ${key} with value: ${-amount}`);
          return this.set(key, -amount, 0)
            .then(() => resolve(-amount))
            .catch(reject);
        }

        this.logger.error(`Unexpected value returned from Memcached decrement for key: ${key}`, { value: result });
        return reject(new NeverError(`Unexpected value returned from Memcached decrement for key '${key}': ${result}`));
      });
    });
  }
}
