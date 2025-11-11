/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { Logger as QueryLogger } from 'drizzle-orm';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@server/constants';

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
  private readonly logger = Logger.getLogger(NAMESPACE, DatabaseService.name);
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

  getPrimaryDatabase(): PrimaryDatabase {
    return this.primaryDB;
  }
}
