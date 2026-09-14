import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { DeletionRepository } from '@modules/deletion';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule], providers: [DeletionRepository], exports: [DeletionRepository] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_deletion_purge_spec`;

describe('DeletionRepository purge', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let db: PrimaryDatabase;
  let deletionRepository: DeletionRepository;

  async function accountWithAudits(identitySub: string): Promise<bigint> {
    const [account] = await db
      .insert(schema.accounts)
      .values({ identitySub, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
      .returning({ id: schema.accounts.id });
    const accountId = account!.id;
    const expenseId = Bun.randomUUIDv7();
    await db.insert(schema.expenseAudits).values([
      { accountId, expenseId, action: 'created', changes: [] },
      { accountId, expenseId, action: 'updated', changes: [{ field: 'note', from: 'a sensitive note', to: null }] },
      { accountId, expenseId, action: 'deleted', changes: [] },
    ]);
    return accountId;
  }

  async function auditCount(accountId: bigint): Promise<number> {
    return (await db.select({ id: schema.expenseAudits.id }).from(schema.expenseAudits).where(eq(schema.expenseAudits.accountId, accountId))).length;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    deletionRepository = app.get(DeletionRepository);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should purge expense audits with the account', async () => {
    const accountId = await accountWithAudits('deletion-purge-audits-sub');
    const otherId = await accountWithAudits('deletion-purge-audits-other-sub');

    await deletionRepository.purge(accountId, 2, 1000);

    expect(await auditCount(accountId)).toBe(0);
    expect(await auditCount(otherId)).toBe(3);
    expect(await deletionRepository.hasResidualRows(accountId)).toBe(false);
  });
});
