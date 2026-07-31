/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
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
 *
 * The configured datastore (forRoot) is imported exactly once at the root; feature modules
 * import the bare `DatabaseModule` class to access the shared, configured `DatabaseService`.
 */

export const DatastoreModule = CoreDatabaseModule.forRoot({
  postgres: {
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
  },
});
