/**
 * Importing npm packages
 */
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { constraintErrorMap } from './datastore.constants';
import * as schema from './schemas';

/**
 * Defining types
 */

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

declare module '@shadow-library/modules' {
  interface DatabaseRecords {
    postgres: PrimaryDatabase;
  }
}

/**
 * Declaring the constants
 */

export const DatastoreModule = CoreDatabaseModule.forRoot({
  postgres: {
    constraintErrorMap,
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
  },
  redis: true,
});
