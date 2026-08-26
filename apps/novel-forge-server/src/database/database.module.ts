import { type BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';

import { constraintErrorMap } from './database.constants';
import * as schema from './schemas';

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;
export type PrimaryTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

/** Whatever a write runs on: the pool, or the transaction a caller has already opened around it. */
export type DbExecutor = PrimaryDatabase | PrimaryTransaction;

declare module '@shadow-library/modules' {
  interface DatabaseRecords {
    postgres: PrimaryDatabase;
  }
}

export const DatabaseModule = CoreDatabaseModule.forRoot({
  postgres: {
    constraintErrorMap,
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
  },
});
