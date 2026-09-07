/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const logger = Logger.getLogger('Scripts', 'Migrate');

/** `migrationsFolder` is resolved from the working directory — the repo root in dev, `/app` in the image. */
export async function runMigrations(migrationsFolder: string): Promise<never> {
  Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

  const url = process.env.DATABASE_POSTGRES_URL;
  if (!url) {
    logger.error('DATABASE_POSTGRES_URL is not set; cannot run migrations');
    process.exit(1);
  }

  const client = new SQL(url, { max: 1 });
  try {
    const db = drizzle({ client });
    logger.info('Applying database migrations');
    await migrate(db, { migrationsFolder });
    await client.close();
    logger.info('Database migrations applied');
    process.exit(0);
  } catch (err) {
    logger.error('Database migration failed', err);
    process.exit(1);
  }
}
