import { SQL } from 'bun';
import { Logger } from '@shadow-library/common';

/**
 * Per-test-file DB cloning: `scripts/db.ts create-template` provisions and migrates the template
 * database once; every test file then clones its own isolated copy from it via
 * `CREATE DATABASE ... TEMPLATE`, through `TestEnvironment`.
 */
const logger = Logger.getLogger('Tests', 'TemplateDBCloner');
const baseConnectionString = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost:7070/shadow_webnovel';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const templateDbName = process.env.POSTGRES_TEMPLATE_DB_NAME ?? 'shadow_webnovel_template';

export async function dropDatabase(dbName: string, sql?: SQL): Promise<void> {
  const isProvidedSQL = Boolean(sql);
  if (!sql) sql = new SQL(baseUrl, { max: 1 });
  await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  logger.debug(`Database '${dbName}' dropped successfully`);
  if (!isProvidedSQL) await sql.close();
}

/**
 * Frees a database of every connection but the caller's. `CREATE DATABASE ... TEMPLATE` requires
 * the source to have no other sessions, and the framework's DatabaseService does not close its
 * postgres pool on shutdown, so prior-clone connections can linger within a test process.
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
