/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, InternalError, Logger } from '@shadow-library/common';
import { DrizzleQueryError, Logger as QueryLogger } from 'drizzle-orm';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Redis } from 'ioredis';
import Memcached from 'memcached';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

import { constraintErrorMap } from './datastore.constants';
import { PostgresError } from './datastore.types';
import * as schema from './schemas';

/**
 * Defining types
 */

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

/**
 * Declaring the constants
 */

@Injectable()
export class DatastoreService {
  private readonly logger = Logger.getLogger(APP_NAME, DatastoreService.name);

  private readonly primaryDB: PrimaryDatabase;
  private readonly redisClient: Redis;
  private readonly memcachedClient?: Memcached;

  constructor() {
    const queryLogger = this.getQueryLogger();
    const primaryDatabaseURL = Config.get('db.primary.url');
    this.primaryDB = drizzle(primaryDatabaseURL, { schema, logger: queryLogger });

    const redisURL = Config.get('cache.redis.url');
    this.redisClient = new Redis(redisURL);

    const memcachedServers = Config.get('cache.memcached.servers');
    if (memcachedServers.length > 0) this.memcachedClient = new Memcached(memcachedServers);
  }

  private getQueryLogger(): QueryLogger {
    return {
      logQuery: (query, params) => {
        for (let index = 1; index <= params.length; index++) {
          const param = params[index - 1];
          const value = typeof param === 'string' ? `'${param}'` : String(param);
          query = query.replace(`$${index}`, value);
        }
        this.logger.debug(`SQL: ${query}`);
      },
    };
  }

  private isPostgresError(error: any): error is PostgresError {
    return error.code === 'ERR_POSTGRES_SERVER_ERROR';
  }

  getPrimaryDatabase(): PrimaryDatabase {
    return this.primaryDB;
  }

  getRedisClient(): Redis {
    return this.redisClient;
  }

  getMemcachedClient(): Memcached | undefined {
    return this.memcachedClient;
  }

  translateError(error: unknown): never {
    if (error instanceof DrizzleQueryError && this.isPostgresError(error.cause)) {
      const appError = constraintErrorMap[error.cause.constraint];
      if (appError) throw appError;
    }

    this.logger.error('Unknown database error', { error });
    throw new InternalError('Unknown database error occurred');
  }
}
