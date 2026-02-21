/**
 * Importing npm packages
 */
import { FactoryProvider, ModuleMetadata } from '@shadow-library/app';
import { type DrizzleConfig } from 'drizzle-orm';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import { type RedisOptions } from 'ioredis';
import type Memcached from 'memcached';
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DatabaseRecords {}

type ResolveType<K extends string, Fallback> = DatabaseRecords extends Record<K, infer T> ? T : Fallback;

export type PostgresClient = ResolveType<'postgres', PgDatabase<any>>;

export interface PostgresError {
  errno: string;
  detail: string;
  severity: string;
  schema: string;
  table: string;
  constraint: string;
  file: string;
  routine: string;
  code: 'ERR_POSTGRES_SERVER_ERROR';
}

export interface PostgresConnectionConfig {
  /** The database connection URL. Resolved from `Config.get('database.postgres.url')` if not provided */
  url: string;

  /** Maximum number of connections. Resolved from `Config.get('database.postgres.max-connections')` if not provided */
  maxConnections?: number;
}

export interface PostgresConfig {
  /** Factory function that creates and returns a Drizzle client instance. */
  factory: (config: DrizzleConfig, connection: PostgresConnectionConfig) => Promisable<PostgresClient>;

  /** Map of PostgreSQL constraint names to application-specific error instances used by `translateError()` */
  constraintErrorMap?: Record<string, Error>;

  lazyConnection?: boolean;
}

export interface RedisConfig {
  /** The Redis connection URL. Falls back to `Config.get('database.redis.url')` if not provided */
  url?: string;

  /** Additional Redis client options */
  options?: RedisOptions;
}

export interface MemcacheConfig {
  /** The Memcached server host(s). Falls back to `Config.get('database.memcache.hosts')` if not provided */
  hosts?: string;

  /** Additional Memcached client options */
  options?: Memcached.options;
}

export interface DatabaseModuleOptions {
  /** Configuration for PostgreSQL via Drizzle ORM */
  postgres?: PostgresConfig;

  /** Configuration for Redis. Pass `true` to use default config from environment variables */
  redis?: boolean | RedisConfig;

  /** Configuration for Memcached. Pass `true` to use default config from environment variables */
  memcache?: boolean | MemcacheConfig;
}

export interface DatabaseModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'>, Pick<FactoryProvider, 'inject'> {
  /** Factory function that returns DatabaseModuleOptions or a Promise resolving to it */
  useFactory: (...args: unknown[]) => Promisable<DatabaseModuleOptions>;
}
