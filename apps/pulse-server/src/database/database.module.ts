import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';

import { constraintErrorMap } from './database.constants';
import * as schema from './schemas';

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

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
