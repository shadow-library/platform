/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

import { seed } from './seed';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const logger = Logger.getLogger('Scripts', 'TemplateDBCreator');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const templateDbName = process.env.POSTGRES_TEMPLATE_DB_NAME ?? 'shadow_pulse_template';

export async function createDatabaseFromTemplate(dbName: string): Promise<string> {
  const sql = new SQL(baseUrl);
  await dropDatabase(dbName, sql);
  await sql.unsafe(`CREATE DATABASE ${dbName} TEMPLATE ${templateDbName}`);
  logger.debug(`Database '${dbName}' created successfully from template '${templateDbName}'`);
  await sql.close();
  return `${baseUrl}/${dbName}`;
}

export async function dropDatabase(dbName: string, sql?: SQL): Promise<void> {
  const isProvidedSQL = Boolean(sql);
  if (!sql) sql = new SQL(baseUrl);
  await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  logger.debug(`Database '${dbName}' dropped successfully`);
  if (!isProvidedSQL) await sql.close();
}

export async function createTemplateDatabase(): Promise<void> {
  const sql = new SQL(baseUrl);
  const databaseExists = await sql`SELECT 1 FROM pg_database WHERE datname = ${templateDbName}`.then(result => result.length > 0);
  if (databaseExists) {
    await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE false`);
    await dropDatabase(templateDbName, sql);
  }

  await sql.unsafe(`CREATE DATABASE ${templateDbName}`);
  logger.debug(`Database ${templateDbName} created successfully`);

  const templateDbUrl = `${baseUrl}/${templateDbName}`;
  const db = drizzle(templateDbUrl, { schema });

  await migrate(db, { migrationsFolder: 'generated/drizzle' });
  logger.debug(`Migrations applied successfully to database '${templateDbName}'`);

  await seed(db);
  logger.debug(`Seed data inserted successfully into database '${templateDbName}'`);

  await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE true`);
  logger.debug(`Database '${templateDbName}' marked as template successfully`);

  logger.info(`Template database '${templateDbName}' created successfully`);
  await sql.close();
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await createTemplateDatabase().catch(err => logger.error('Template database creation failed', err));
}
