import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Logger } from '@shadow-library/common';
import { createMigrationClient } from '@shadow-library/modules/bootstrap';

import { APP_NAME } from '@server/constants';
import { schema } from '@server/database';
import { seedBaseline } from '@server/database/seed';

const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
const migrationsFolder = process.env.MIGRATIONS_FOLDER || 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate-db');

Logger.attachTransport('console:json');

try {
  const db = drizzle({ client: createMigrationClient(url), schema });
  await migrate(db, { migrationsFolder });
  logger.info('Database migration completed successfully');
  await seedBaseline(db);
  logger.info('Database baseline seeding completed successfully');
} catch (error: any) {
  logger.error('Database migration failed', { error });
  if ('cause' in error) logger.error('Cause', { cause: error.cause });
  process.exit(1);
}
