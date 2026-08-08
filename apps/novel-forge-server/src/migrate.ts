import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

/**
 * Applies the Drizzle SQL migrations shipped alongside the bundle and provisions
 * the LangGraph checkpointer tables. It reads the same `DATABASE_POSTGRES_URL` the server uses, so the
 * migration job and the app container share one connection contract. `MIGRATIONS_FOLDER` overrides the
 * default `generated/drizzle` — the folder `shadow build` copies next to this entry, resolved from the
 * working directory (the repo root in dev, `/app` in the image).
 */
const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const migrationsFolder = process.env['MIGRATIONS_FOLDER'] ?? 'generated/drizzle';
const logger = Logger.getLogger(APP_NAME, 'migrate');

Logger.attachTransport(Config.isProd() ? 'console:json' : 'console:pretty');

try {
  const db = drizzle(url);
  await migrate(db, { migrationsFolder });
  logger.info('Drizzle migrations applied');
  const checkPointer = PostgresSaver.fromConnString(url);
  await checkPointer.setup();
  logger.info('LangGraph checkpointer tables created');
  logger.info('Database migration completed successfully');
  await db.$client.close();
} catch (error) {
  logger.error('Database migration failed', { error });
  if (error instanceof Error && error.cause) logger.error('Cause', { cause: error.cause });
  process.exit(1);
}
