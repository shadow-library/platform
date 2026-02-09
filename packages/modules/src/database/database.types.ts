/**
 * Importing npm packages
 */
import { FactoryProvider, ModuleMetadata } from '@shadow-library/app';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import { type RedisOptions } from 'ioredis';
import type Memcached from 'memcached';
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { QueryLogger } from './database.service';

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    'database.postgres.url'?: string;
    'database.postgres.max-connections'?: number;
    'database.redis.url'?: string;
    'database.memcache.hosts'?: string;
  }
}

export interface DatabaseRecords {
  drizzle?: PgDatabase<any>;
}

export type DrizzleClient = Exclude<DatabaseRecords['drizzle'], undefined>;

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

/** Supported built-in drizzle-orm PostgreSQL driver sub-packages */
export type DrizzleDriver = 'bun-sql' | 'node-postgres' | 'postgres-js' | 'neon' | 'pglite' | 'vercel-postgres' | 'xata-http' | 'pg-proxy' | 'aws-data-api';

export interface BasePostgresConfig {
  type: DrizzleDriver | 'custom';

  /** Map of PostgreSQL constraint names to application-specific error instances used by `translateError()` */
  constraintErrorMap?: Record<string, Error>;
}

export interface DrizzleDriverPostgresConfig extends BasePostgresConfig {
  /** The drizzle-orm driver sub-package name */
  type: DrizzleDriver;

  /** The database schema object passed to the drizzle driver */
  schema: Record<string, unknown>;

  /** Driver-specific connection options passed alongside the resolved URL */
  connection?: Record<string, unknown>;

  /** The database connection URL. Falls back to `Config.get('database.postgres.url')` if not provided */
  url?: string;
}

export interface CustomPostgresConfig extends BasePostgresConfig {
  /** Discriminant indicating a custom factory is used */
  type: 'custom';

  /** Factory function that returns a Drizzle client instance */
  factory: (logger: QueryLogger) => DrizzleClient;
}

export type PostgresConfig = DrizzleDriverPostgresConfig | CustomPostgresConfig;

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
