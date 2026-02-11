/**
 * Importing npm packages
 */
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';
import { Config, InternalError, Logger, NeverError } from '@shadow-library/common';
import { type Logger as DrizzleLogger } from 'drizzle-orm';
import type Redis from 'ioredis';
import type Memcached from 'memcached';

/**
 * Importing user defined packages
 */
import { DATABASE_MODULE_OPTIONS, LOGGER_NAMESPACE } from './database.constants';
import { type DatabaseModuleOptions, DrizzleClient, MemcacheConfig, PostgresError, RedisConfig } from './database.types';

/**
 * Defining types
 */

type ConfigKey = 'database.postgres.url' | 'database.redis.url' | 'database.memcache.hosts';

interface DrizzleDriver {
  drizzle: (config: Record<string, unknown>) => DrizzleClient;
}

export type LinkedWithParent<T, U> = T & { getParent: () => U };

export interface QueryLogger extends DrizzleLogger {
  isEnabled: boolean;
}

/**
 * Declaring the constants
 */
const DEFAULT_CONFIGS: Record<ConfigKey, string> = {
  'database.postgres.url': 'postgresql://postgres:postgres@localhost/shadow_db',
  'database.memcache.hosts': 'localhost:11211',
  'database.redis.url': 'redis://localhost:6379',
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'DatabaseService');

  private drizzleClient?: DrizzleClient;
  private redisClient?: Redis;
  private memcacheClient?: Memcached;

  constructor(@Inject(DATABASE_MODULE_OPTIONS) private readonly options: DatabaseModuleOptions) {}

  private resolveConnectionUrl(database: string, url: string | undefined, configKey: ConfigKey): string {
    if (url) return url;
    Config.load(configKey, { defaultValue: DEFAULT_CONFIGS[configKey], isProdRequired: true });
    const resolved = Config.get(configKey);
    if (!resolved) throw new InternalError(`${database} connection URL not provided and the config value for '${configKey}' is not set`);
    return resolved;
  }

  private getQueryLogger(): QueryLogger {
    const isLogEnabled = !Config.isProd() && (Config.get('log.level') === 'debug' || Config.get('log.level') === 'silly');
    if (!isLogEnabled) return { isEnabled: false, logQuery: () => {} }; // eslint-disable-line @typescript-eslint/no-empty-function

    return {
      isEnabled: true,
      logQuery: (query: string, params: unknown[]) => {
        /**
         * Substituting parameters from the last to the first to avoid replacing $10 as $1 followed by a literal 0.
         * This is a simple substitution and may not cover all edge cases, but it provides more readable logs for most queries.
         */
        let formattedQuery = query;
        for (let index = params.length - 1; index >= 0; index--) {
          const param = params[index];
          const value = typeof param === 'string' ? `'${param}'` : String(param);
          formattedQuery = formattedQuery.replace(`$${index + 1}`, value);
        }
        this.logger.debug(`SQL: ${formattedQuery}`);
      },
    };
  }

  private async importDrizzleDriver(driverName: string): Promise<DrizzleDriver> {
    try {
      const mod = (await import(`drizzle-orm/${driverName}`)) as DrizzleDriver;
      if (!mod || typeof mod.drizzle !== 'function') throw new InternalError(`Invalid drizzle driver module imported for type '${driverName}'`);
      return mod;
    } catch (error) {
      this.logger.error(`Failed to import drizzle driver for type '${driverName}'`, error);
      let message = `Failed to load Drizzle driver for type '${driverName}'. Ensure the driver sub-package is installed.`;
      if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'MODULE_NOT_FOUND') {
        message += ` The missing module is likely 'drizzle-orm/${driverName}', so check that this sub-package is included in your dependencies.`;
      }
      message += ` Original error: ${error instanceof Error ? error.message : String(error)}`;
      throw new InternalError(message);
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.options.postgres) {
      this.logger.debug('Initializing Drizzle client with config', { config: this.options.postgres });
      const postgres = this.options.postgres;
      const queryLogger = this.getQueryLogger();

      if (postgres.type === 'custom') this.drizzleClient = postgres.factory(queryLogger);
      else {
        const mod = await this.importDrizzleDriver(postgres.type);
        const logger = queryLogger.isEnabled ? this.logger : false;
        const connectionUrl = this.resolveConnectionUrl('PostgreSQL', postgres.url, 'database.postgres.url');
        const connection = postgres.connection ? { url: connectionUrl, ...postgres.connection } : connectionUrl;
        this.drizzleClient = mod.drizzle({ schema: postgres.schema, logger, connection });
      }

      if (!this.drizzleClient) throw new NeverError('Drizzle client is in an impossible state: undefined after initialization');
      await this.drizzleClient.execute('SELECT 1');
      this.logger.info('Drizzle client connected');
    }

    if (this.options.redis) {
      const config: RedisConfig = this.options.redis === true ? {} : this.options.redis;
      this.logger.debug('Initializing Redis client with config', { config });
      const { url, options = {} } = config;
      const connectionUrl = this.resolveConnectionUrl('Redis', url, 'database.redis.url');
      const { default: RedisClient } = await import('ioredis');
      this.redisClient = new RedisClient(connectionUrl, options);
      await new Promise<void>((resolve, reject) => {
        if (!this.redisClient) throw new NeverError('Redis client is in an impossible state: undefined after instantiation');
        this.redisClient.once('ready', () => resolve());
        this.redisClient.once('error', (err: Error) => reject(err));
      });

      this.logger.info('Redis client connected');
    }

    if (this.options.memcache) {
      const config: MemcacheConfig = this.options.memcache === true ? {} : this.options.memcache;
      this.logger.debug('Initializing Memcached client with config', { config });
      const { hosts, options } = config;
      const connectionHosts = this.resolveConnectionUrl('Memcached', hosts, 'database.memcache.hosts');
      const { default: MemcachedClient } = await import('memcached');
      this.memcacheClient = options ? new MemcachedClient(connectionHosts, options) : new MemcachedClient(connectionHosts);
      await new Promise<void>((resolve, reject) => {
        if (!this.memcacheClient) throw new NeverError('Memcached client is in an impossible state: undefined after instantiation');
        this.memcacheClient.stats((err: Error) => (err ? reject(err) : resolve()));
      });

      this.logger.info('Memcached client connected');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.memcacheClient) {
      this.memcacheClient.end();
      this.logger.info('Memcached client disconnected');
    }

    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.info('Redis client disconnected');
    }
  }

  getDrizzleClient(): DrizzleClient {
    if (!this.drizzleClient) throw new InternalError('Drizzle client is not initialized. Ensure drizzle config is provided in DatabaseModuleOptions');
    return this.drizzleClient;
  }

  getRedisClient(): Redis {
    if (!this.redisClient) throw new InternalError('Redis client is not initialized. Ensure redis config is provided in DatabaseModuleOptions');
    return this.redisClient;
  }

  getMemcacheClient(): Memcached {
    if (!this.memcacheClient) throw new InternalError('Memcached client is not initialized. Ensure memcache config is provided in DatabaseModuleOptions');
    return this.memcacheClient;
  }

  isDrizzleEnabled(): boolean {
    return this.drizzleClient !== undefined;
  }

  isRedisEnabled(): boolean {
    return this.redisClient !== undefined;
  }

  isMemcacheEnabled(): boolean {
    return this.memcacheClient !== undefined;
  }

  private isPostgresError(error: unknown): error is PostgresError {
    return typeof error === 'object' && error !== null && 'code' in error && (error as Record<string, unknown>).code === 'ERR_POSTGRES_SERVER_ERROR';
  }

  translateError(error: unknown): never {
    const constraintErrorMap = this.options.postgres?.constraintErrorMap ?? {};

    if (this.isPostgresError(error)) {
      const appError = constraintErrorMap[error.constraint];
      if (appError) throw appError;
      this.logger.error('Unmapped postgres constraint error', error);
    }

    if (error instanceof Error && 'cause' in error && this.isPostgresError(error.cause)) {
      const cause = error.cause as PostgresError;
      if (constraintErrorMap) {
        const appError = constraintErrorMap[cause.constraint];
        if (appError) throw appError;
      }
      this.logger.error('Unmapped postgres constraint error', cause);
    }

    this.logger.error('Unknown database error', error);
    throw new InternalError('Unknown database error occurred');
  }

  attachParent<T extends object, U>(target: T, parent: U): LinkedWithParent<T, U> {
    Object.defineProperty(target, 'getParent', { value: () => parent, enumerable: false, writable: false, configurable: false });
    return target as LinkedWithParent<T, U>;
  }

  attachMatchingParent<S extends object, P extends object>(sources: S[], sourceKey: keyof S, parents: P[], parentKey?: keyof P): LinkedWithParent<S, P | null>[];
  attachMatchingParent<S extends object, P extends object>(sources: S[], sourceKey: keyof S, parents: P[], throwErrorIfNotFound: true): LinkedWithParent<S, P>[];
  attachMatchingParent<S extends object, P extends object>(
    sources: S[],
    sourceKey: keyof S,
    parents: P[],
    parentKey: keyof P,
    throwErrorIfNotFound: true,
  ): LinkedWithParent<S, P>[];
  attachMatchingParent<S extends object, P extends object>(
    sources: S[],
    sourceKey: keyof S,
    parents: P[],
    parentKeyOrThrowErrorIfNotFound?: keyof P | boolean,
    throwErrorIfNotFound = false,
  ): LinkedWithParent<S, P | null>[] {
    let parentKey = typeof parentKeyOrThrowErrorIfNotFound === 'undefined' ? sourceKey : parentKeyOrThrowErrorIfNotFound;
    if (typeof parentKeyOrThrowErrorIfNotFound === 'boolean') {
      throwErrorIfNotFound = parentKeyOrThrowErrorIfNotFound;
      parentKey = sourceKey;
    }

    const parentMap = new Map<string, P>();
    for (const parent of parents) {
      const key = String(parent[parentKey as keyof P]);
      parentMap.set(key, parent);
    }

    const result: LinkedWithParent<S, P | null>[] = [];
    for (const source of sources) {
      const key = String(source[sourceKey]);
      const parent = parentMap.get(key) ?? null;
      if (parent === null && throwErrorIfNotFound) throw new InternalError(`Parent not found for source with key ${key}`);
      const linkedSource = this.attachParent(source, parent);
      result.push(linkedSource);
    }

    return result;
  }
}
