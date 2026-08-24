import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
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
const databaseName = `${baseConnectionString.split('/').pop()}_receipt_cascade_spec`;
const DATE = '2026-08-24';

describe('Expense-deletion receipt cascade (T-26)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let storage: StorageService;
  let db: PrimaryDatabase;
  let bearer: string;

  async function findReceipt(ref: string) {
    const [row] = await db.select().from(schema.receipts).where(eq(schema.receipts.ref, ref));
    return row ?? null;
  }

  function envelope(type: string, payload: Record<string, unknown> = {}) {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  async function submitOne(type: string, payload: Record<string, unknown> = {}) {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${bearer}` })
      .body({ commands: [envelope(type, payload)] });
    return (response.json().outcomes as { status: string; result: Record<string, unknown>; error?: { code: string } }[])[0]!;
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    storage = app.get(StorageService);
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    bearer = await userToken('receipt-cascade-sub');
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should delete the receipt row and object when the owning expense is deleted', async () => {
    const created = (
      await router
        .mockRequest()
        .post('/api/v1/receipts')
        .headers({ authorization: `Bearer ${bearer}` })
        .body({ contentType: 'image/jpeg', sizeBytes: 1024 })
    ).json();
    await fetch(created.uploadUrl, { method: 'PUT', body: new TextEncoder().encode('receipt bytes'), headers: { 'Content-Type': 'image/jpeg' } });
    await router
      .mockRequest()
      .post(`/api/v1/receipts/${encodeURIComponent(created.ref)}/confirm`)
      .headers({ authorization: `Bearer ${bearer}` });

    const expenseId = Bun.randomUUIDv7();
    const createOutcome = await submitOne('expense.create', {
      id: expenseId,
      amountMinor: 500,
      amountText: '5.00',
      currency: 'USD',
      categoryId: 'food',
      occurredOn: DATE,
      receiptRef: created.ref,
    });
    expect(createOutcome.status).toBe('applied');

    expect(await storage.exists(created.ref)).toBe(true);
    expect(await findReceipt(created.ref)).not.toBeNull();

    const deleteOutcome = await submitOne('expense.delete', { id: expenseId });
    expect(deleteOutcome.status).toBe('applied');

    expect(await storage.exists(created.ref)).toBe(false);
    expect(await findReceipt(created.ref)).toBeNull();
  });

  it('should not fail expense deletion when the expense carries no receipt', async () => {
    const expenseId = Bun.randomUUIDv7();
    await submitOne('expense.create', { id: expenseId, amountMinor: 300, amountText: '3.00', currency: 'USD', categoryId: 'food', occurredOn: DATE });
    const outcome = await submitOne('expense.delete', { id: expenseId });
    expect(outcome.status).toBe('applied');
  });
});
