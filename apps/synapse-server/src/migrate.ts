import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';
import { createMigrationClient } from '@shadow-library/modules/bootstrap';

import '@server/bootstrap';

import { APP_NAME } from '@server/constants';
import { schema } from '@server/database';
import { applySeedCatalog, buildSeedCatalog, openSeedDatabase } from '@server/database/seed';

const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/synapse';
const migrationsFolder = process.env.MIGRATIONS_FOLDER || 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate-db');

Logger.attachTransport('console:json');

let failed = false;
const migrationClient = createMigrationClient(url);
const seedDatabase = openSeedDatabase(url);

try {
  const db = drizzle({ client: migrationClient, schema });
  await migrate(db, { migrationsFolder });
  const document = buildSeedCatalog(Config.get('synapse.seed.profile'), {
    subscription: Config.get('synapse.provider.subscription.url'),
    openrouter: Config.get('synapse.provider.openrouter.url'),
    local: Config.get('synapse.provider.local.url'),
  });
  await applySeedCatalog(seedDatabase.repository, document);
  logger.info('Database migration completed successfully');
} catch (error: any) {
  failed = true;
  logger.error('Database migration failed', { error });
  if ('cause' in error) logger.error('Cause', { cause: error.cause });
} finally {
  await Promise.allSettled([migrationClient.close(), seedDatabase.close()]);
}

process.exit(failed ? 1 : 0);
