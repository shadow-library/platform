import { type BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { Module } from '@shadow-library/app';
import { DatabaseModule as CoreDatabaseModule, DatabaseService } from '@shadow-library/modules';

import { constraintErrorMap } from './database.constants';
import { RolePoolService } from './role-pool.service';
import * as schema from './schemas';

export type PrimaryDatabase = BunSQLDatabase<typeof schema>;

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

/**
 * The API/command path's default pool (`memoir_api`, provisioned by `DATABASE_POSTGRES_URL`) plus
 * `RolePoolService`, which lets a module request the dedicated `memoir_ai`/`memoir_billing` pools a
 * command path must never touch (ARCHITECTURE §5.4).
 */
@Module({ imports: [CorePostgresModule], providers: [RolePoolService], exports: [DatabaseService, RolePoolService] })
export class DatastoreModule {}
