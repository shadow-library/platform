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
    /**
     * Two pushes can race past the lookup and both insert; whichever index rejects the loser, its re-read
     * decides whether the row is its own or truly foreign. Both map to WBN_010 because both are answered
     * the same way — publish under a slug this caller can hold.
     */
    constraintErrorMap: {
      novels_slug_unique: AppErrorCode.WBN_010.create(),
      novels_source_client_id_source_ref_unique: AppErrorCode.WBN_010.create(),
    },
  },
});
