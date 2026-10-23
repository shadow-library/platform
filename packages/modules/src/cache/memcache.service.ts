import type Memcached from 'memcached';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, MaybeNull } from '@shadow-library/common';

import { DatabaseService } from '../database/database.service';
import { LOGGER_NAMESPACE } from './cache.constants';
import { type ICacheStore } from './cache.types';

type MemcachedCallback<T> = (err: unknown, result: T) => void;

type AdjustOperation = 'incr' | 'decr';

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

  private exec<T>(operation: (client: Memcached, done: MemcachedCallback<T>) => void): Promise<T> {
    const client = this.memcached;
    if (!client) throw AppError.internal('Memcached client is not initialized. Ensure memcache config is provided in DatabaseModuleOptions');
    return new Promise<T>((resolve, reject) => operation(client, (err, result) => (err ? reject(err as Error) : resolve(result))));
  }

  /** Increments or decrements a numeric value, initializing the key when it does not exist */
  private async adjust(operation: AdjustOperation, key: string, amount: number): Promise<number> {
    const verb = operation === 'incr' ? 'incremented' : 'decremented';
    const result = await this.exec<number | boolean>((client, done) => client[operation](key, amount, done));

    if (typeof result === 'number') {
      this.logger.debug(`cache ${verb} for key: ${key}`, { amount, value: result });
      return result;
    }

    if (result === false) {
      const initialValue = operation === 'incr' ? amount : -amount;
      this.logger.debug(`Memcached key not found for ${operation}, initializing key: ${key} with value: ${initialValue}`);
      await this.set(key, initialValue, 0);
      return initialValue;
    }

    this.logger.error(`Unexpected value returned from Memcached ${operation} for key: ${key}`, { value: result });
    throw AppError.internal(`Unexpected value returned from Memcached ${operation} for key '${key}': ${String(result)}`);
  }

  async get<T = any>(key: string): Promise<MaybeNull<T>> {
    if (!this.memcached) return null;
    const data = await this.exec<T | undefined>((client, done) => client.get(key, done));
    if (data === undefined) this.logger.debug(`cache miss for key: ${key}`);
    else this.logger.debug(`cache hit for key: ${key}`, { value: data });
    return data ?? null;
  }

  async set<T = any>(key: string, value: T, ttlSeconds = 0): Promise<void> {
    if (!this.memcached) return;
    await this.exec<boolean>((client, done) => client.set(key, value, ttlSeconds, done));
    this.logger.debug(`cache set for key: ${key}`, { value, lifetime: ttlSeconds });
  }

  async del(key: string): Promise<void> {
    if (!this.memcached) return;
    await this.exec<boolean>((client, done) => client.del(key, done));
    this.logger.debug(`cache deleted for key: ${key}`);
  }

  async incr(key: string, amount = 1): Promise<number> {
    return this.adjust('incr', key, amount);
  }

  async decr(key: string, amount = 1): Promise<number> {
    return this.adjust('decr', key, amount);
  }
}
