/**
 * Importing npm packages
 */
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';
import { Config, InternalError, Logger, NeverError } from '@shadow-library/common';
import { type DrizzleConfig } from 'drizzle-orm';
import type Redis from 'ioredis';
import type Memcached from 'memcached';

/**
 * Importing user defined packages
 */
import { DATABASE_MODULE_OPTIONS, LOGGER_NAMESPACE } from './database.constants';
import { type DatabaseModuleOptions, MemcacheConfig, PostgresClient, PostgresConnectionConfig, PostgresError, RedisConfig } from './database.types';
import { renderPostgresQuery } from './database.utils';

/**
 * Defining types
 */

type ConfigKey = 'database.postgres.url' | 'database.redis.url' | 'database.memcache.hosts';

export type LinkedWithParent<T, U> = T & { getParent: () => U };

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

  private postgresClient?: PostgresClient;
  private redisClient?: Redis;
  private memcacheClient?: Memcached;

  constructor(@Inject(DATABASE_MODULE_OPTIONS) private readonly options: DatabaseModuleOptions) {}

  private resolveConnectionUrl(database: string, configKey: ConfigKey, url?: string): string {
    if (url) return url;
    Config.load(configKey, { defaultValue: DEFAULT_CONFIGS[configKey], isProdRequired: true });
    const resolved = Config.get(configKey);
    this.logger.debug(`Resolved ${database} connection URL from config key '${configKey}'`);
    if (!resolved) throw new InternalError(`${database} connection URL not provided and the config value for '${configKey}' is not set`);
    return resolved;
  }

  private getImportError(error: unknown, packageName: string, contextLabel: string): InternalError {
    const isModuleNotFound = typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND';
    const original = error instanceof Error ? error.message : String(error);

    let message = `Failed to load ${contextLabel}. `;
    if (isModuleNotFound) {
      const runtime = Config.getRuntime();
      const installCommand = runtime === 'bun' || runtime === 'deno' ? `${runtime} add ${packageName}` : `npm install ${packageName}`;
      message += `The package '${packageName}' is not installed. Run '${installCommand}' (or the equivalent for your package manager) and try again.`;
    } else message += `The package '${packageName}' was found but could not be loaded. Original error: ${original}`;

    return new InternalError(message);
  }

  async onModuleInit(): Promise<void> {
    if (this.options.postgres) {
      const postgres = this.options.postgres;

      /** Drizzle Configs */
      const drizzleConfig: DrizzleConfig = { logger: false };
      const isLogEnabled = !Config.isProd() && (Config.get('log.level') === 'debug' || Config.get('log.level') === 'silly');
      if (isLogEnabled) drizzleConfig.logger = { logQuery: (query, params) => this.logger.debug(`SQL: ${renderPostgresQuery(query, params)}`) };

      /** Connection Configs */
      const connectionConfig: PostgresConnectionConfig = { url: this.resolveConnectionUrl('PostgreSQL', 'database.postgres.url') };
      Config.load('database.postgres.max-connections', { validateType: 'number' });
      const maxConnections = Config.get('database.postgres.max-connections');
      if (maxConnections) connectionConfig.maxConnections = maxConnections;

      /** Initialize client and verify connection */
      this.postgresClient = await postgres.factory(drizzleConfig, connectionConfig);
      if (!this.postgresClient) throw new NeverError('Postgres client is in an impossible state: undefined after initialization');

      Config.load('database.postgres.lazy-connection', { validateType: 'boolean', defaultValue: 'false' });
      const isLazyConnection = postgres.lazyConnection ?? Config.get('database.postgres.lazy-connection') ?? false;
      if (isLazyConnection) this.logger.info('Postgres client initialized with lazy connection');
      else {
        await this.postgresClient.execute('SELECT 1');
        this.logger.info('Postgres client connected');
      }
    }

    if (this.options.redis) {
      let RedisClient: typeof Redis;
      try {
        ({ default: RedisClient } = await import('ioredis'));
      } catch (error) {
        throw this.getImportError(error, 'ioredis', 'Redis client');
      }
      const config: RedisConfig = this.options.redis === true ? {} : this.options.redis;
      const { url, options = {} } = config;
      const connectionUrl = this.resolveConnectionUrl('Redis', 'database.redis.url', url);
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
      const { hosts, options } = config;
      const connectionHosts = this.resolveConnectionUrl('Memcached', 'database.memcache.hosts', hosts);
      let MemcachedClient: typeof Memcached;
      try {
        ({ default: MemcachedClient } = await import('memcached'));
      } catch (error) {
        throw this.getImportError(error, 'memcached', 'Memcached client');
      }
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

  getPostgresClient(): PostgresClient {
    if (!this.postgresClient) throw new InternalError('Postgres client is not initialized. Ensure postgres config is provided in DatabaseModuleOptions');
    return this.postgresClient;
  }

  getRedisClient(): Redis {
    if (!this.redisClient) throw new InternalError('Redis client is not initialized. Ensure redis config is provided in DatabaseModuleOptions');
    return this.redisClient;
  }

  getMemcacheClient(): Memcached {
    if (!this.memcacheClient) throw new InternalError('Memcached client is not initialized. Ensure memcache config is provided in DatabaseModuleOptions');
    return this.memcacheClient;
  }

  isPostgresEnabled(): boolean {
    return this.postgresClient !== undefined;
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
