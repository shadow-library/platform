import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { FinanceModule } from '@modules/finance';
import { ReceiptsModule } from '@modules/receipts';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule, ReceiptsModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, FinanceModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_expense_audits_spec`;

const DATE = '2026-08-24';

interface Outcome {
  commandId: string;
  status: string;
  replayed: boolean;
}

interface AuditRow {
  id: string;
  expenseId: string;
  action: string;
  changes: { field: string; from: string | null; to: string | null }[];
  deviceId: string | null;
  createdAt: string;
  syncSeq: string;
}

interface AuditPage {
  cursor: string;
  domains: { expense_audits: AuditRow[] };
  tombstones: { domain: string; recordId: string }[];
}

interface Fixture {
  token: string;
  accountId: bigint;
}

describe('Expense audit trail (P1-19)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let storage: StorageService;
  let subject = 0;

  function envelope(type: string, payload: Record<string, unknown>): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  function expenseDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { id: Bun.randomUUIDv7(), amountMinor: 420, amountText: '4.20', currency: 'USD', categoryId: 'food', occurredOn: DATE, note: 'Flat white', ...overrides };
  }

  async function submit(token: string, commands: Record<string, unknown>[]): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return response.json().outcomes as Outcome[];
  }

  async function pullAuditPage(token: string, since = '0'): Promise<AuditPage> {
    const response = await router
      .mockRequest()
      .get('/api/v1/sync/delta')
      .headers({ authorization: `Bearer ${token}` })
      .query({ since, domains: 'expense_audits' });
    return response.json() as AuditPage;
  }

  async function pullAudits(token: string, since = '0'): Promise<AuditRow[]> {
    return (await pullAuditPage(token, since)).domains.expense_audits;
  }

  async function auditsOf(token: string, expenseId: string): Promise<AuditRow[]> {
    return (await pullAudits(token)).filter(row => row.expenseId === expenseId);
  }

  async function freshAccount(): Promise<Fixture> {
    subject += 1;
    const sub = `expense-audits-sub-${subject}`;
    const token = await userToken(sub);
    await submit(token, [envelope('expense.create', expenseDraft())]);
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    return { token, accountId: account!.id };
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should record an audit row for each changed expense field', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft();
    await submit(token, [envelope('expense.create', draft)]);
    const cursor = (await pullAudits(token)).reduce((max, row) => (BigInt(row.syncSeq) > BigInt(max) ? row.syncSeq : max), '0');

    const [outcome] = await submit(token, [envelope('expense.update', { id: draft['id'], amountMinor: 520, amountText: '5.20', categoryId: 'transport', note: 'Flat white' })]);
    expect(outcome?.status).toBe('applied');

    const rows = await auditsOf(token, String(draft['id']));
    expect(rows.map(row => row.action)).toEqual(['created', 'updated']);
    expect(rows[0]?.changes).toEqual([]);
    expect(rows[1]?.changes).toEqual([
      { field: 'amountMinor', from: '420', to: '520' },
      { field: 'categoryId', from: 'food', to: 'transport' },
    ]);
    expect((await pullAudits(token, cursor)).map(row => row.id)).toEqual([rows[1]!.id]);
  });

  it('should record a cleared note or merchant with a null target', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft({ merchant: 'Kaffebrenneriet' });
    await submit(token, [envelope('expense.create', draft), envelope('expense.update', { id: draft['id'], note: '', merchant: null })]);

    const [, updated] = await auditsOf(token, String(draft['id']));
    expect(updated?.changes).toEqual([
      { field: 'note', from: 'Flat white', to: null },
      { field: 'merchant', from: 'Kaffebrenneriet', to: null },
    ]);
  });

  it('should write no audit row for an update that changes no audited field', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft();
    await submit(token, [
      envelope('expense.create', draft),
      envelope('expense.update', { id: draft['id'], amountMinor: 420, amountText: '4.2', categoryId: 'food', note: 'Flat white' }),
    ]);

    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created']);
  });

  it('should record expense deletion in the audit', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft();
    await submit(token, [envelope('expense.create', draft)]);
    const [outcome] = await submit(token, [envelope('expense.delete', { id: draft['id'] })]);
    expect(outcome?.status).toBe('applied');

    const rows = await auditsOf(token, String(draft['id']));
    expect(rows.map(row => ({ action: row.action, changes: row.changes }))).toEqual([{ action: 'deleted', changes: [] }]);
  });

  it("should remove the expense's earlier audit rows when the expense is deleted", async () => {
    const { token, accountId } = await freshAccount();
    const draft = expenseDraft({ merchant: 'Kaffebrenneriet' });
    await submit(token, [envelope('expense.create', draft), envelope('expense.update', { id: draft['id'], note: 'Oat flat white', merchant: 'Tim Wendelboe' })]);
    const before = await pullAuditPage(token);
    const earlier = before.domains.expense_audits.filter(row => row.expenseId === draft['id']);
    expect(earlier.map(row => row.action)).toEqual(['created', 'updated']);

    await submit(token, [envelope('expense.delete', { id: draft['id'] })]);

    const stored = await db
      .select()
      .from(schema.expenseAudits)
      .where(eq(schema.expenseAudits.expenseId, String(draft['id'])));
    expect(stored.map(row => ({ action: row.action, changes: row.changes }))).toEqual([{ action: 'deleted', changes: [] }]);
    const tombstoned = await db
      .select()
      .from(schema.deletedRecords)
      .where(and(eq(schema.deletedRecords.accountId, accountId), eq(schema.deletedRecords.tableName, 'expense_audits')));
    expect(tombstoned.map(row => row.recordId).sort()).toEqual(earlier.map(row => row.id).sort());

    const after = await pullAuditPage(token, before.cursor);
    expect(after.domains.expense_audits.filter(row => row.expenseId === draft['id']).map(row => row.action)).toEqual(['deleted']);
    expect(
      after.tombstones
        .filter(tombstone => tombstone.domain === 'expense_audits')
        .map(tombstone => tombstone.recordId)
        .sort(),
    ).toEqual(earlier.map(row => row.id).sort());
    expect(JSON.stringify(after)).not.toContain('Wendelboe');
  });

  it('should not duplicate audit rows when a command is replayed', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft();
    const create = envelope('expense.create', draft);
    const update = envelope('expense.update', { id: draft['id'], amountMinor: 999, amountText: '9.99' });
    const remove = envelope('expense.delete', { id: draft['id'] });

    await submit(token, [create, update]);
    expect((await submit(token, [create, update])).map(outcome => outcome.replayed)).toEqual([true, true]);
    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created', 'updated']);

    await submit(token, [remove]);
    expect((await submit(token, [create, update, remove])).map(outcome => outcome.replayed)).toEqual([true, true, true]);
    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['deleted']);
  });

  it('should start a fresh history when a pruned replay re-creates a deleted expense id', async () => {
    const { token } = await freshAccount();
    const draft = expenseDraft();
    await submit(token, [envelope('expense.create', draft), envelope('expense.delete', { id: draft['id'] })]);

    const [outcome] = await submit(token, [envelope('expense.create', draft)]);
    expect(outcome?.status).toBe('applied');

    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created']);
  });

  it('should record the created row of an expense confirmed from a subscription cycle once', async () => {
    const { token, accountId } = await freshAccount();
    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        accountId,
        name: 'Streaming',
        amountMinor: 999n,
        amountText: '9.99',
        currency: 'USD',
        frequency: 'monthly',
        billingDay: 24,
        nextDueDate: DATE,
        categoryId: 'subs',
        monthlyEquivalentMinor: 999n,
      })
      .returning();
    const expenseId = Bun.randomUUIDv7();
    const confirm = { id: String(subscription!.id), billingDate: DATE, expenseId };

    await submit(token, [envelope('subscription.confirmCycle', confirm)]);
    await submit(token, [envelope('subscription.confirmCycle', { ...confirm, expenseId: Bun.randomUUIDv7() })]);

    expect((await auditsOf(token, expenseId)).map(row => row.action)).toEqual(['created']);
  });

  it('should record a stored receipt attached at creation as receipt_confirmed', async () => {
    const { token, accountId } = await freshAccount();
    const ref = `r/${accountId}/${Bun.randomUUIDv7()}.jpg`;
    await db.insert(schema.receipts).values({ ref, accountId, contentType: 'image/jpeg', sizeBytes: 1024, status: 'stored' });
    const draft = expenseDraft({ receiptRef: ref });

    await submit(token, [envelope('expense.create', draft)]);

    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created', 'receipt_confirmed']);
  });

  it('should record receipt_confirmed once when the upload of an attached receipt is confirmed', async () => {
    const { token, accountId } = await freshAccount();
    const ref = `r/${accountId}/${Bun.randomUUIDv7()}.jpg`;
    await db.insert(schema.receipts).values({ ref, accountId, contentType: 'image/jpeg', sizeBytes: 1024 });
    const draft = expenseDraft({ receiptRef: ref });
    await submit(token, [envelope('expense.create', draft)]);
    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created']);

    const stat = spyOn(storage, 'stat').mockResolvedValue({ size: 2048, contentType: 'image/jpeg' });
    const confirm = () =>
      router
        .mockRequest()
        .post(`/api/v1/receipts/${encodeURIComponent(ref)}/confirm`)
        .headers({ authorization: `Bearer ${token}` });
    try {
      expect((await confirm()).json().status).toBe('stored');
      expect((await confirm()).json().status).toBe('stored');
    } finally {
      stat.mockRestore();
    }

    expect((await auditsOf(token, String(draft['id']))).map(row => row.action)).toEqual(['created', 'receipt_confirmed']);
  });

  it('should keep another account out of the audit domain', async () => {
    const mine = await freshAccount();
    const theirs = await freshAccount();
    const draft = expenseDraft();
    await submit(theirs.token, [envelope('expense.create', draft)]);

    expect(await auditsOf(mine.token, String(draft['id']))).toEqual([]);
    const [row] = await db
      .select()
      .from(schema.expenseAudits)
      .where(eq(schema.expenseAudits.expenseId, String(draft['id'])));
    expect(row?.accountId).toBe(theirs.accountId);
  });
});
