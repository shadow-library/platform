/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A one-shot entry that applies the drizzle SQL migrations shipped alongside the bundle. It uses the
 * same bun-sql driver and `DATABASE_POSTGRES_URL` the server reads, so the migration job and the app
 * container share one connection contract. The folder is resolved from the working directory, which
 * holds `generated/drizzle` both in the repo and under `/app` in the image.
 */
const logger = Logger.getLogger('Scripts', 'Migrate');
const migrationsFolder = 'generated/drizzle';

async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_POSTGRES_URL;
  if (!url) {
    logger.error('DATABASE_POSTGRES_URL is not set; cannot run migrations');
    process.exit(1);
  }

  const client = new SQL(url, { max: 1 });
  const db = drizzle({ client });
  logger.info('Applying database migrations');
  await migrate(db, { migrationsFolder });
  await client.close();
  logger.info('Database migrations applied');
}

if (Config.isProd()) Logger.attachTransport('console:json');
else Logger.attachTransport('console:pretty');

runMigrations()
  .then(() => process.exit(0))
  .catch(err => (logger.error('Database migration failed', err), process.exit(1)));
