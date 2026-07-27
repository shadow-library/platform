/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Runs on Bun's native SQL driver — `drizzle-kit migrate` insists on a Node postgres driver this
 * repo deliberately does not ship.
 */
const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/shadow_webnovel';
const migrationsFolder = process.env.MIGRATIONS_FOLDER || 'generated/drizzle';
const logger = Logger.getLogger('Scripts', 'MigrateDB');

Logger.attachTransport('console:pretty');

try {
  const client = new SQL(url, { max: 1 });
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder });
  await client.close();
  logger.info('Database migration completed successfully');
} catch (error) {
  logger.error('Database migration failed', { error });
  process.exit(1);
}
