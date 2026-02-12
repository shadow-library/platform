/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';
import { BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { PgTableWithColumns } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import * as schema from '@modules/database/schemas';

import * as seedData from './seed-data';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const logger = Logger.getLogger('Scripts', 'Seeder');
const orderedTables: (keyof typeof schema)[] = [
  'templateGroups',
  'templateVariants',
  'templateChannelSettings',
  'senderProfiles',
  'senderEndpoints',
  'senderRoutingRules',
  'notificationJobs',
  'notificationMessages',
];

function getTableName(table: PgTableWithColumns<any>): string {
  const symbol = Object.getOwnPropertySymbols(table).find(s => s.toString() === 'Symbol(drizzle:Name)');
  return symbol ? (table as any)[symbol] : 'unknown_table';
}

export async function seed(db?: BunSQLDatabase<typeof schema>): Promise<void> {
  if (!db) {
    const url = process.env.DATABASE_POSTGRES_URL ?? 'postgresql://postgres:postgres@localhost/shadow_pulse';
    db = drizzle(url, { schema });
    logger.debug(`Connected to database '${url.split('/').pop()}' for seeding`);
  }

  const tableList = orderedTables.map(table => getTableName(schema[table] as PgTableWithColumns<any>)).join(', ');
  await db.execute(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
  logger.debug('Truncated existing data from all tables');

  for (const tableName of orderedTables) {
    const data = (seedData as Record<string, unknown>)[tableName];
    if (!Array.isArray(data)) {
      logger.warn(`Seed data for '${tableName}' not found, Skipping`);
      continue;
    }

    const table = schema[tableName] as PgTableWithColumns<any>;
    await db.insert(table).values(data);
    logger.debug(`Inserted ${data.length} records into table '${tableName}'`);
  }

  /** Reset the sequences */
  await db.execute(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT
            n.nspname AS schema_name,
            c.relname AS table_name,
            a.attname AS column_name,
            pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid
          WHERE c.relkind = 'r'
            AND n.nspname = 'public'
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) IS NOT NULL
        LOOP
          EXECUTE format(
            'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)',
            r.seq_name, r.column_name, r.schema_name, r.table_name
          );
        END LOOP;
      END $$;
    `);
  logger.debug('Sequences reset successfully');

  logger.info('Database seeding completed successfully');
}

if (import.meta.path === Bun.main) {
  Logger.attachTransport('console:pretty');
  await seed().catch(err => logger.error('Seeding failed', err));
}
