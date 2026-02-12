/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
const migrationsFolder = process.env.MIGRATIONS_FOLDER || 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate-db');

Logger.attachTransport('console:json');

try {
  const db = drizzle(url);
  await migrate(db, { migrationsFolder });
  logger.info('Database migration completed successfully');
} catch (error: any) {
  logger.error('Database migration failed', { error });
  if ('cause' in error) logger.error('Cause', { cause: error.cause });
  process.exit(1);
}
