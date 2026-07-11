/**
 * Importing npm packages
 */
import { ShadowApplication } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';

/**
 * Importing user defined packages
 */
import * as schema from '@server/modules/infrastructure/datastore/schemas';
import { SeedModule } from '@server/seed.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const logger = Logger.getLogger('Scripts', 'TemplateDBCreator');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:5432/shadow_identity';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const templateDbName = process.env.POSTGRES_TEMPLATE_DB_NAME ?? 'shadow_identity_template';

export async function dropDatabase(dbName: string, sql?: SQL): Promise<void> {
  const isProvidedSQL = Boolean(sql);
  if (!sql) sql = new SQL(baseUrl, { max: 1 });
  await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  logger.debug(`Database '${dbName}' dropped successfully`);
  if (!isProvidedSQL) await sql.close();
}

async function seedTemplate(templateDbUrl: string): Promise<void> {
  Config['cache'].set('database.postgres.url', templateDbUrl);
  const app = new ShadowApplication(SeedModule);
  await app.init();
  await app.stop();
}

/**
 * Frees a database of every connection but the caller's. `CREATE DATABASE ... TEMPLATE` requires
 * the source to have no other sessions, and the framework's DatabaseService does not close its
 * postgres pool on shutdown, so seed/prior-clone connections can linger within a test process.
 */
async function terminateConnections(dbName: string, sql: SQL): Promise<void> {
  await sql.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`);
}

export async function createDatabaseFromTemplate(dbName: string): Promise<string> {
  const sql = new SQL(baseUrl, { max: 1 });
  await dropDatabase(dbName, sql);
  await terminateConnections(templateDbName, sql);
  await sql.unsafe(`CREATE DATABASE ${dbName} TEMPLATE ${templateDbName}`);
  logger.debug(`Database '${dbName}' created from template '${templateDbName}'`);
  await sql.close();
  return `${baseUrl}/${dbName}`;
}

export async function createTemplateDatabase(): Promise<void> {
  const sql = new SQL(baseUrl, { max: 1 });
  const databaseExists = await sql`SELECT 1 FROM pg_database WHERE datname = ${templateDbName}`.then(result => result.length > 0);
  if (databaseExists) {
    await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE false`);
    await dropDatabase(templateDbName, sql);
  }

  await sql.unsafe(`CREATE DATABASE ${templateDbName}`);
  logger.debug(`Database '${templateDbName}' created successfully`);

  const templateDbUrl = `${baseUrl}/${templateDbName}`;
  const client = new SQL(templateDbUrl, { max: 1 });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: 'generated/drizzle' });
  await client.close();
  logger.debug(`Migrations applied to template database '${templateDbName}'`);

  await seedTemplate(templateDbUrl);
  logger.debug(`Seed data provisioned in template database '${templateDbName}'`);

  await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE true`);
  logger.info(`Template database '${templateDbName}' created successfully`);
  await sql.close();
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await createTemplateDatabase().catch(err => (logger.error('Template database creation failed', err), process.exit(1)));
}
