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

/**
 * Migrations share the app's role and database, so these zero out any `ALTER DATABASE … SET` timeouts. They travel as startup parameters
 * because a `SET` reaches only the connection it ran on, not the one the migration transaction may be handed.
 */
export const MIGRATION_SESSION_SETTINGS = { statement_timeout: 0, lock_timeout: 0, idle_in_transaction_session_timeout: 0 } as const;

export function createMigrationClient(url: string): SQL {
  return new SQL(url, { max: 1, connection: MIGRATION_SESSION_SETTINGS });
}

/** For node-postgres consumers: `pg` drops a falsy `statement_timeout` from its config, so zeroes only reach the server as libpq `options`. */
export function toMigrationConnectionString(url: string): string {
  const connectionUrl = new URL(url);
  const settings = Object.entries(MIGRATION_SESSION_SETTINGS).map(([name, value]) => `-c ${name}=${value}`);
  const existing = connectionUrl.searchParams.get('options');
  connectionUrl.searchParams.set('options', [existing, ...settings].filter(Boolean).join(' '));
  return connectionUrl.toString();
}

/** `migrationsFolder` is resolved from the working directory — the repo root in dev, `/app` in the image. */
export async function runMigrations(migrationsFolder: string): Promise<never> {
  Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

  const url = process.env.DATABASE_POSTGRES_URL;
  if (!url) {
    logger.error('DATABASE_POSTGRES_URL is not set; cannot run migrations');
    process.exit(1);
  }

  const client = createMigrationClient(url);
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
