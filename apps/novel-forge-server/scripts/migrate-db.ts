/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Logger } from '@shadow-library/common';

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

const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const migrationsFolder = process.env['MIGRATIONS_FOLDER'] ?? 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate-db');

Logger.attachTransport('console:pretty');

try {
  const db = drizzle(url);
  await migrate(db, { migrationsFolder });
  logger.info('Drizzle migrations applied');
  const checkPointer = PostgresSaver.fromConnString(url);
  await checkPointer.setup();
  logger.info('LangGraph check pointer tables created');
  logger.info('Database migration completed successfully');
  await db.$client.close();
} catch (error: any) {
  logger.error('Database migration failed', { error });
  if ('cause' in error) logger.error('Cause', { cause: error.cause });
  process.exit(1);
}
