/**
 * Importing npm packages
 */
import { DatabaseModule as CoreDatabaseModule } from '@shadow-library/modules';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';

/**
 * Importing user defined packages
 */
import { constraintErrorMap } from './database.constants';
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

export const DatabaseModule = CoreDatabaseModule.forRoot({
  postgres: {
    constraintErrorMap,
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
  },
});
