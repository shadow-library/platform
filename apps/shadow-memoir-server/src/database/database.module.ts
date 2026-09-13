import { type BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Module } from '@shadow-library/app';
import { DatabaseModule as CoreDatabaseModule, DatabaseService } from '@shadow-library/modules';

import { constraintErrorMap } from './database.constants';
import * as schema from './schemas';

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

export type DatabaseTransaction = Parameters<Parameters<PrimaryDatabase['transaction']>[0]>[0];

declare module '@shadow-library/modules' {
  interface DatabaseRecords {
    postgres: PrimaryDatabase;
  }
}

const CorePostgresModule = CoreDatabaseModule.forRoot({
  postgres: {
    constraintErrorMap,
    factory: (config, connection) => drizzle({ ...config, schema, connection: { url: connection.url, max: connection.maxConnections } }),
  },
});

@Module({ imports: [CorePostgresModule], exports: [DatabaseService] })
export class DatastoreModule {}
