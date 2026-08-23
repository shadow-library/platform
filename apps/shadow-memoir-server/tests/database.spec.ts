import { SQL } from 'bun';
import { afterAll, describe, expect, it } from 'bun:test';

import { sql } from 'drizzle-orm';
import { Module, ShadowApplication } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { DatastoreModule } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule] })
class DatabaseTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_database_spec`;

describe('Database foundation', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;

  afterAll(async () => {
    // Config is a process-wide singleton and `register`'s `load` short-circuits once a key is
    // loaded, so a leftover override here would point every test file that boots after this one at
    // a database this suite is about to drop — restore the value other specs expect, not just unset it.
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should open the database, run a trivial query, and shut down without leaking connections', async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);

    const app = new ShadowApplication(DatabaseTestModule);
    await app.init();

    const databaseService = app.get(DatabaseService);
    const rows = await databaseService.getPostgresClient().execute(sql`select 1 as value`);
    expect(Number((rows[0] as { value: unknown }).value)).toBe(1);

    await app.stop();

    const monitor = new SQL(`${baseUrl}/${databaseName}`, { max: 1 });
    // Postgres reaps a just-closed session asynchronously: `close()` resolving doesn't guarantee the
    // server-side backend has exited yet, so the count needs a short poll rather than one immediate read.
    let remaining = -1;
    for (let attempt = 0; attempt < 20 && remaining !== 0; attempt++) {
      const [row] = await monitor`select count(*)::int as count from pg_stat_activity where datname = ${databaseName} and pid <> pg_backend_pid()`;
      remaining = row?.count ?? -1;
      if (remaining !== 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(remaining).toBe(0);
    await monitor.close();
  });
});
