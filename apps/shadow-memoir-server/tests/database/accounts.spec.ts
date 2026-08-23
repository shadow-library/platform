import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Module, ShadowApplication } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { accounts, DatastoreModule, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule] })
class AccountsTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_accounts_spec`;

function newAccount(identitySub: string, overrides: Partial<typeof accounts.$inferInsert> = {}): typeof accounts.$inferInsert {
  return { identitySub, authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC', ...overrides };
}

describe('accounts schema (T-08)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let db: PrimaryDatabase;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(AccountsTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    db = databaseService.getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should insert an account with the documented defaults', async () => {
    const [row] = await databaseService.run(() => db.insert(accounts).values(newAccount('sub-defaults')).returning());

    expect(row).toMatchObject({ level: 1, totalXp: 0n, coins: 0, theme: 'system', intensityMode: 'standard', warmthState: 'cold', deletionState: 'none' });
  });

  it('should reject a duplicate identity_sub through the mapped domain error', async () => {
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-dup')));

    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-dup'))).catch(error => (thrown = error));

    expect(AppError.is(thrown, AppErrorCode.ACC_001)).toBe(true);
  });

  it('should reject a negative total_xp via the monotonic-counter CHECK constraint', async () => {
    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-neg-xp', { totalXp: -1n }))).catch(error => (thrown = error));

    expect(AppError.is(thrown)).toBe(true);
    expect((thrown as AppError).isInternal).toBe(true);
  });

  it('should reject a negative coins value via the monotonic-counter CHECK constraint', async () => {
    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-neg-coins', { coins: -5 }))).catch(error => (thrown = error));

    expect(AppError.is(thrown)).toBe(true);
  });

  it('should reject an out-of-range schedule_start_min via the minute-of-day CHECK constraint', async () => {
    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-bad-start', { scheduleStartMin: 1500 }))).catch(error => (thrown = error));

    expect(AppError.is(thrown)).toBe(true);
  });

  it('should reject an out-of-range schedule_end_min via the minute-of-day CHECK constraint', async () => {
    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-bad-end', { scheduleEndMin: -1 }))).catch(error => (thrown = error));

    expect(AppError.is(thrown)).toBe(true);
  });

  it('should reject an out-of-range week_start via its CHECK constraint', async () => {
    let thrown: unknown;
    await databaseService.run(() => db.insert(accounts).values(newAccount('sub-bad-week', { weekStart: 7 }))).catch(error => (thrown = error));

    expect(AppError.is(thrown)).toBe(true);
  });
});
