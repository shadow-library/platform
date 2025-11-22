/**
 * Importing npm packages
 */
import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import Redis from 'ioredis';

/**
 * Importing user defined packages
 */
import { CACHE_MODULE_OPTIONS, LOGGER_NAMESPACE } from './cache.constants';
import { type CacheModuleOptions } from './cache.module';
import { type ICacheStore } from './cache.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class RedisCacheService implements ICacheStore {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, RedisCacheService.name);
  private readonly redis: Redis;

  constructor(@Inject(CACHE_MODULE_OPTIONS) options: CacheModuleOptions) {
    this.redis = options.redis;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) {
      this.logger.debug(`cache miss for key: ${key}`);
      return null;
    }

    this.logger.debug(`cache hit for key: ${key}`, { value: data });
    return JSON.parse(data) as T;
  }

  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const data = JSON.stringify(value);
    if (ttlSeconds) await this.redis.set(key, data, 'EX', ttlSeconds);
    else await this.redis.set(key, data);
    this.logger.debug(`cache set for key: ${key}`, { value, ttlSeconds });
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
    this.logger.debug(`cache deleted for key: ${key}`);
  }

  async incr(key: string, amount = 1): Promise<number> {
    const result = await this.redis.incrby(key, amount);
    this.logger.debug(`cache incremented for key: ${key}`, { amount, value: result });
    return result;
  }

  async decr(key: string, amount = 1): Promise<number> {
    const result = await this.redis.decrby(key, amount);
    this.logger.debug(`cache decremented for key: ${key}`, { amount, value: result });
    return result;
  }

  /** Publishes a message to a specific channel in Redis Pub/Sub */
  async publish(channel: string, message: string): Promise<void> {
    await this.redis.publish(channel, message);
    this.logger.debug(`Published message to channel: ${channel}`, { message });
  }
}
