import { type DrizzleConfig } from 'drizzle-orm';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import { type RedisOptions } from 'ioredis';
import type Memcached from 'memcached';
import { Promisable } from 'type-fest';

import { type AsyncModuleOptions } from '../internal.utils';

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'database.postgres.url'?: string;
    'database.postgres.max-connections'?: number;
    'database.postgres.lazy-connection': boolean;
    'database.postgres.prepare': boolean;
    'database.redis.url'?: string;
    'database.memcache.hosts'?: string;
  }
}

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

  /**
   * Named server-side prepared statements; the factory must pass it to the driver's `prepare` option. Default `false` (`database.postgres.prepare`):
   * Bun SQL 1.3.14 stalls pipelined queries on named prepared statements, so `true` under Bun refuses to boot in a production deployment and warns elsewhere.
   * Unnamed statements get no parameter type inference, so never hand the driver a raw object or Date; bind jsonb as JSON text cast `::text::jsonb`.
   */
  prepare: boolean;
}

export interface PostgresConfig {
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

export type DatabaseModuleAsyncOptions = AsyncModuleOptions<DatabaseModuleOptions>;
