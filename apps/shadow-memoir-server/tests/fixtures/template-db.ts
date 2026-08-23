import { SQL } from 'bun';
import { Logger } from '@shadow-library/common';

/**
 * Per-test-file DB cloning: `scripts/db.ts create-template` provisions and migrates the template
 * database once; every test file then clones its own isolated copy from it via
 * `CREATE DATABASE ... TEMPLATE`, through `TestEnvironment`.
 */
const logger = Logger.getLogger('Scripts', 'TemplateDBCreator');
const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const templateDbName = process.env['POSTGRES_TEMPLATE_DB_NAME'] ?? 'shadow_memoir_template';

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
