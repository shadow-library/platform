/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, InternalError, Logger } from '@shadow-library/common';
import { DrizzleQueryError, Logger as QueryLogger } from 'drizzle-orm';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

import { constraintErrorMap } from './database.constants';
import { PostgresError } from './database.types';
import * as schema from './schemas';

/**
 * Defining types
 */

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

/**
 * Declaring the constants
 */

@Injectable()
export class DatabaseService {
  private readonly logger = Logger.getLogger(APP_NAME, DatabaseService.name);
  private readonly primaryDB: PrimaryDatabase;

  constructor() {
    const queryLogger = this.getQueryLogger();
    const primaryDatabaseURL = Config.get('db.primary.url');
    this.primaryDB = drizzle(primaryDatabaseURL, { schema, logger: queryLogger });
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

  translateError(error: unknown): never {
    if (error instanceof DrizzleQueryError && this.isPostgresError(error.cause)) {
      const appError = constraintErrorMap[error.cause.constraint];
      if (appError) throw appError;
    }

    this.logger.error('Unknown database error', { error });
    throw new InternalError('Unknown database error occurred');
  }
}
