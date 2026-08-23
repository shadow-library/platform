import { SQL } from 'bun';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { Logger } from '@shadow-library/common';

import { type PrimaryDatabase } from '@server/database';

/**
 * The four runtime roles (T-14) are created `LOGIN` with no password by their migration — a real
 * password is an ops secret (SOPS, T-04) applied out of band per environment. The local test cluster
 * requires password auth even for loopback connections (Docker Desktop's networking does not present
 * as `127.0.0.1` to the container, so `pg_hba`'s `trust` line never matches), so the template-seed hook
 * sets one fixed, non-secret password here — cluster-level, so it survives every `CREATE DATABASE ...
 * TEMPLATE` clone the test suite makes. Never reused outside `bun test`.
 */
export const TEST_ROLE_PASSWORD = 'memoir-test-role-password';

const RUNTIME_ROLES = ['memoir_api', 'memoir_ai', 'memoir_billing', 'memoir_deleter'] as const;

export async function seed(db: PrimaryDatabase): Promise<void> {
  for (const role of RUNTIME_ROLES) await db.execute(sql.raw(`ALTER ROLE ${role} PASSWORD '${TEST_ROLE_PASSWORD}'`));
}

const logger = Logger.getLogger('Scripts', 'TemplateSeed');

/** `scripts/db.ts create-template` runs this file as a standalone script (`bun run tests/fixtures/seed.ts`), against `DATABASE_POSTGRES_URL` pointed at the freshly migrated template DB — mirrors `src/migrate.ts`'s self-invocation shape. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_POSTGRES_URL;
  if (!url) {
    logger.error('DATABASE_POSTGRES_URL is not set; cannot seed the template database');
    process.exit(1);
  }

  const client = new SQL(url, { max: 1 });
  const db = drizzle({ client }) as unknown as PrimaryDatabase;
  await seed(db);
  await client.close();
  logger.info('Template database seeded');
}

if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch(err => (logger.error('Template seed failed', err), process.exit(1)));
}
