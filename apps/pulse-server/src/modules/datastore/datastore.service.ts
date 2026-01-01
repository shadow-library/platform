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

import { constraintErrorMap } from './datastore.constants';
import { PostgresError } from './datastore.types';
import * as schema from './schemas';

/**
 * Defining types
 */

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

export type LinkedWithParent<T, U> = T & { getParent: () => U };

/**
 * Declaring the constants
 */

@Injectable()
export class DatastoreService {
  private readonly logger = Logger.getLogger(APP_NAME, DatastoreService.name);

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
      this.logger.error('Postgres error', error.cause);
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
