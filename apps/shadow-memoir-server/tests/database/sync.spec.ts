import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Module, ShadowApplication } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { accounts, commandLog, DatastoreModule, deletedRecords, devices, type PrimaryDatabase } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

@Module({ imports: [DatastoreModule] })
class SyncTestModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_sync_spec`;

describe('sync spine (T-08)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let databaseService: DatabaseService;
  let db: PrimaryDatabase;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = new ShadowApplication(SyncTestModule);
    await app.init();
    databaseService = app.get(DatabaseService);
    db = databaseService.getPostgresClient() as PrimaryDatabase;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should draw deleted_records.sync_seq from the shared sequence and keep it increasing', async () => {
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-sync', authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    if (!account) throw new Error('account insert failed');

    const [first] = await databaseService.run(() => db.insert(deletedRecords).values({ accountId: account.id, tableName: 'quest_logs', recordId: '1' }).returning());
    const [second] = await databaseService.run(() => db.insert(deletedRecords).values({ accountId: account.id, tableName: 'quest_logs', recordId: '2' }).returning());

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second!.syncSeq > first!.syncSeq).toBe(true);
  });

  it('should cascade device and command_log rows when the owning account is deleted', async () => {
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-cascade', authProvider: 'apple', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    if (!account) throw new Error('account insert failed');
    const deviceId = crypto.randomUUID();
    const commandId = crypto.randomUUID();

    await databaseService.run(() => db.insert(devices).values({ id: deviceId, accountId: account.id }));
    await databaseService.run(() => db.insert(commandLog).values({ accountId: account.id, commandId, type: 'CompleteQuest', status: 'applied', deviceId }));

    await databaseService.run(() => db.delete(accounts).where(eq(accounts.id, account.id)));

    const remainingDevices = await db.select().from(devices).where(eq(devices.id, deviceId));
    const remainingCommands = await db.select().from(commandLog).where(eq(commandLog.commandId, commandId));
    expect(remainingDevices).toHaveLength(0);
    expect(remainingCommands).toHaveLength(0);
  });

  it('should reject a replayed command_id for the same account through its primary key', async () => {
    const [account] = await databaseService.run(() =>
      db
        .insert(accounts)
        .values({ identitySub: 'sub-replay', authProvider: 'google', defaultCurrency: 'USD', enabledCurrencies: ['USD'], timezone: 'UTC' })
        .returning(),
    );
    if (!account) throw new Error('account insert failed');
    const commandId = crypto.randomUUID();

    await databaseService.run(() => db.insert(commandLog).values({ accountId: account.id, commandId, type: 'CompleteQuest', status: 'applied' }));

    await expect(databaseService.run(() => db.insert(commandLog).values({ accountId: account.id, commandId, type: 'CompleteQuest', status: 'applied' }))).rejects.toThrow();
  });
});
