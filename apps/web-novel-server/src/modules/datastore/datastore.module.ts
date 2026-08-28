import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';

import * as schema from './schemas';

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

declare module '@shadow-library/modules' {
  interface DatabaseRecords {
    postgres: PrimaryDatabase;
  }
}

export const DatastoreModule = CoreDatabaseModule.forRoot({
  postgres: {
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
    /** Two publishers can race past the by-slug lookup and both insert; the index rejects the loser, who needs a retryable conflict rather than a 500. */
    constraintErrorMap: { novels_slug_unique: AppErrorCode.WBN_010.create() },
  },
});
