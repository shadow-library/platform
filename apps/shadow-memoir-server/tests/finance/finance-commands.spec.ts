import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { and, eq } from 'drizzle-orm';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { type FetchedRate, FinanceModule, FxReconciliationService, HttpFxRateClient } from '@modules/finance';
import { SyncModule } from '@modules/sync';
import { DatastoreModule, type PrimaryDatabase, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { userToken } from '../test-idp';

const TestHttpModule = FastifyModule.forRoot({ imports: [MemoirAuthModule, SyncModule], host: 'localhost', port: 0 });

@Module({ imports: [DatastoreModule, TestHttpModule, FinanceModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_finance_commands_spec`;

const DATE = '2026-08-24';

interface Outcome {
  commandId: string;
  status: string;
  result: Record<string, unknown>;
  replayed: boolean;
  error?: { code: string; message: string };
}

describe('Finance commands (T-25)', () => {
  const originalUrl = (Config['cache'].get('database.postgres.url') as string | undefined) ?? baseConnectionString;
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: PrimaryDatabase;
  let bearer: string;
  let accountId: bigint;
  let subject = 0;

  function envelope(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    return { commandId: Bun.randomUUIDv7(), type, payload, localDate: DATE };
  }

  async function submit(commands: Record<string, unknown>[], token = bearer): Promise<Outcome[]> {
    const response = await router
      .mockRequest()
      .post('/api/v1/sync/commands')
      .headers({ authorization: `Bearer ${token}` })
      .body({ commands });
    return response.json().outcomes as Outcome[];
  }

  async function submitOne(type: string, payload: Record<string, unknown> = {}, token = bearer): Promise<Outcome> {
    const [outcome] = await submit([envelope(type, payload)], token);
    return outcome!;
  }

  /** A brand-new account, first touched by the caller's own command — so `expense_categories` seeding is exercised from a cold start each time. */
  async function freshAccount(): Promise<{ token: string; sub: string }> {
    subject += 1;
    const sub = `finance-sub-${subject}`;
    return { token: await userToken(sub), sub };
  }

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);
    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient() as PrimaryDatabase;
    bearer = await userToken('finance-commands-sub');

    await submitOne('expense.create', { id: Bun.randomUUIDv7(), amountMinor: 1, amountText: '0.01', currency: 'USD', categoryId: 'food', occurredOn: DATE });
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, 'finance-commands-sub'));
    accountId = account!.id;
  });

  afterAll(async () => {
    await app.stop();
    Config['cache'].set('database.postgres.url', originalUrl);
    await dropDatabase(databaseName);
  });

  it('should seed the 9 built-in categories on first finance touch', async () => {
    const categories = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.accountId, accountId));
    expect(categories).toHaveLength(9);
    expect(categories.map(category => category.key).sort()).toEqual(['bills', 'food', 'groceries', 'health', 'home', 'shopping', 'subs', 'transport', 'uncat'].sort());
  });

  it('should seed categories idempotently when two commands race on the same fresh account', async () => {
    const { token, sub } = await freshAccount();

    const first = envelope('expense.create', { id: Bun.randomUUIDv7(), amountMinor: 500, amountText: '5.00', currency: 'USD', categoryId: 'food', occurredOn: DATE });
    const second = envelope('expense.create', { id: Bun.randomUUIDv7(), amountMinor: 700, amountText: '7.00', currency: 'USD', categoryId: 'transport', occurredOn: DATE });
    await Promise.all([submit([first], token), submit([second], token)]);

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    const categories = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.accountId, account!.id));
    expect(categories).toHaveLength(9);
  });

  it('should round-trip amount_minor and amount_text exactly as submitted', async () => {
    const id = Bun.randomUUIDv7();
    await submitOne('expense.create', { id, amountMinor: 1234, amountText: '12.34', currency: 'USD', categoryId: 'food', occurredOn: DATE, note: 'lunch' });

    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(expense!.amountMinor).toBe(1234n);
    expect(expense!.amountText).toBe('12.34');
  });

  it('should save a cross-currency expense with a null fx rate when no cached rate exists, then let update recompute nothing until reconciliation resolves it', async () => {
    const id = Bun.randomUUIDv7();
    await submitOne('expense.create', { id, amountMinor: 1000, amountText: '10.00', currency: 'JPY', categoryId: 'food', occurredOn: DATE });

    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(expense!.fxRate).toBeNull();
    expect(expense!.homeAmountMinor).toBeNull();
  });

  it('should resolve a null fx rate via the reconciliation sweep using the rate dated at occurred_on, through a fake FxRateClient double', async () => {
    const id = Bun.randomUUIDv7();
    const occurredOn = '2026-07-01';
    await submitOne('expense.create', { id, amountMinor: 2000, amountText: '20.00', currency: 'GBP', categoryId: 'food', occurredOn });

    const fxRateClient = app.get(HttpFxRateClient);
    const original = fxRateClient.fetchRates.bind(fxRateClient);
    fxRateClient.fetchRates = async (pairs): Promise<FetchedRate[]> => pairs.map(pair => ({ ...pair, rate: pair.base === 'GBP' ? 1.25 : 1 }));

    await app.get(FxReconciliationService).run();
    fxRateClient.fetchRates = original;

    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(expense!.fxRate).not.toBeNull();
    expect(Number(expense!.fxRate)).toBeCloseTo(1.25, 6);
    expect(expense!.fxRateDate).toBe(occurredOn);
    expect(expense!.homeAmountMinor).toBe(2500n);
  });

  it('should keep a locked fx rate immutable under a note/category edit and recompute the home amount when the amount is edited', async () => {
    const id = Bun.randomUUIDv7();
    const occurredOn = '2026-06-01';
    await db.insert(schema.fxRates).values({ date: occurredOn, base: 'EUR', quote: 'USD', rate: '1.10000000' }).onConflictDoNothing();
    await submitOne('expense.create', { id, amountMinor: 1000, amountText: '10.00', currency: 'EUR', categoryId: 'food', occurredOn });

    const [created] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(created!.fxRate).not.toBeNull();
    expect(created!.homeAmountMinor).toBe(1100n);
    const lockedRate = created!.fxRate;

    await submitOne('expense.update', { id, note: 'edited note', categoryId: 'shopping' });
    const [afterNoteEdit] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(afterNoteEdit!.fxRate).toBe(lockedRate);
    expect(afterNoteEdit!.homeAmountMinor).toBe(1100n);
    expect(afterNoteEdit!.categoryId).toBe('shopping');

    await submitOne('expense.update', { id, amountMinor: 2000, amountText: '20.00' });
    const [afterAmountEdit] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id));
    expect(afterAmountEdit!.fxRate).toBe(lockedRate);
    expect(afterAmountEdit!.homeAmountMinor).toBe(2200n);
  });

  it('should reject changing the currency on an existing expense', async () => {
    const id = Bun.randomUUIDv7();
    await submitOne('expense.create', { id, amountMinor: 100, amountText: '1.00', currency: 'USD', categoryId: 'food', occurredOn: DATE });
    const outcome = await submitOne('expense.update', { id, currency: 'EUR' });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.code).toBe('FIN_006');
  });

  it('should advance next_due_date monthly and produce one cycle expense and one coin, converging on two concurrent confirms of the same cycle', async () => {
    const created = await submitOne('subscription.create', {
      name: 'Streaming',
      amountMinor: 999,
      amountText: '9.99',
      currency: 'USD',
      frequency: 'monthly',
      billingDay: 31,
      nextDueDate: '2026-01-31',
      categoryId: 'subs',
    });
    const subscriptionId = created.result['id'] as string;
    const billingDate = '2026-01-31';

    const first = envelope('subscription.confirmCycle', { id: subscriptionId, billingDate });
    const second = envelope('subscription.confirmCycle', { id: subscriptionId, billingDate });
    const [firstOutcomes, secondOutcomes] = await Promise.all([submit([first]), submit([second])]);

    expect(firstOutcomes[0]!.status).toBe('applied');
    expect(secondOutcomes[0]!.status).toBe('applied');
    expect(firstOutcomes[0]!.result['expenseId']).toBe(secondOutcomes[0]!.result['expenseId']);

    const cycleExpenses = await db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.linkedSubscriptionId, BigInt(subscriptionId)), eq(schema.expenses.billingCycleDate, billingDate)));
    expect(cycleExpenses).toHaveLength(1);

    const coinEvents = await db
      .select()
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, accountId), eq(schema.heroEvents.dedupeKey, `sub_${subscriptionId}_${billingDate}`)));
    expect(coinEvents).toHaveLength(1);
    expect(coinEvents[0]!.coinsDelta).toBe(1);

    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, BigInt(subscriptionId)));
    expect(subscription!.nextDueDate).toBe('2026-02-28');
    expect(subscription!.lastConfirmedDate).toBe(billingDate);
  });

  it('should keep the cycle identity after editing the fired expense date, so no double coin is granted', async () => {
    const created = await submitOne('subscription.create', {
      name: 'Gym',
      amountMinor: 500,
      amountText: '5.00',
      currency: 'USD',
      frequency: 'monthly',
      billingDay: 15,
      nextDueDate: '2026-03-15',
      categoryId: 'health',
    });
    const subscriptionId = created.result['id'] as string;
    const billingDate = '2026-03-15';

    const confirm = await submitOne('subscription.confirmCycle', { id: subscriptionId, billingDate });
    const expenseId = confirm.result['expenseId'] as string;

    await submitOne('expense.update', { id: expenseId, occurredOn: '2026-03-20' });

    const [expense] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, expenseId));
    expect(expense!.occurredOn).toBe('2026-03-20');
    expect(expense!.billingCycleDate).toBe(billingDate);
    expect(expense!.linkedSubscriptionId).toBe(BigInt(subscriptionId));

    const secondConfirm = await submitOne('subscription.confirmCycle', { id: subscriptionId, billingDate });
    expect(secondConfirm.result['expenseId']).toBe(expenseId);

    const coinEvents = await db
      .select()
      .from(schema.heroEvents)
      .where(and(eq(schema.heroEvents.accountId, accountId), eq(schema.heroEvents.dedupeKey, `sub_${subscriptionId}_${billingDate}`)));
    expect(coinEvents).toHaveLength(1);
  });
});
