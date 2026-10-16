import { drizzle } from 'drizzle-orm/bun-sql';
import { DatabaseService } from '@shadow-library/modules';

import { CatalogVersionRepository } from '@modules/catalog/catalog-version.repository';

import { constraintErrorMap } from '../database.constants';
import { type PrimaryDatabase } from '../database.module';
import * as schema from '../schemas';

export interface SeedConnection {
  schema: typeof schema;
  connection: { url: string; max: number; prepare: boolean };
}

export type SeedDatabaseFactory = (config: SeedConnection) => PrimaryDatabase;

export interface SeedDatabase {
  repository: CatalogVersionRepository;
  databaseService: Pick<DatabaseService, 'getPostgresClient' | 'run' | 'translateError'>;
  close(): Promise<void>;
}

export function openSeedDatabase(url: string, factory: SeedDatabaseFactory = drizzle): SeedDatabase {
  const db = factory({ schema, connection: { url, max: 1, prepare: false } });
  const translator = new DatabaseService({ postgres: { factory: () => db, constraintErrorMap } });
  const databaseService = {
    getPostgresClient: () => db,
    run: <T>(operation: () => Promise<T>) => translator.run(operation),
    translateError: (error: unknown): never => translator.translateError(error),
  };
  return {
    repository: new CatalogVersionRepository(databaseService as DatabaseService),
    databaseService,
    close: async () => void (await (db as unknown as { $client: { close(): Promise<void> } }).$client.close()),
  };
}
