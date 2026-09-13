import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

const url = process.env['DATABASE_POSTGRES_URL'];
const migrationsFolder = process.env['MIGRATIONS_FOLDER'] ?? 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate');

Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

if (!url) {
  logger.error('DATABASE_POSTGRES_URL is not set; cannot run migrations');
  process.exit(1);
}

const client = new SQL(url, { max: 1 });

/**
 * Shadow Memoir has no data worth preserving yet, so a failed migration wipes the database back to empty
 * instead of leaving a half-migrated schema, or a `drizzle.__drizzle_migrations` row, for the next deploy
 * to trip over. Remove this before the first real user signs up.
 */
async function resetDatabase(): Promise<void> {
  await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await client.unsafe('CREATE SCHEMA public');
}

try {
  await migrate(drizzle({ client }), { migrationsFolder });
  logger.info('Database migrations applied');
  await client.close();
  process.exit(0);
} catch (error) {
  logger.error('Database migration failed; dropping every table and record', { error, cause: error instanceof Error ? error.cause : undefined });
  await resetDatabase().catch(resetError => logger.error('Database reset after failed migration also failed', { error: resetError }));
  await client.close();
  process.exit(1);
}
