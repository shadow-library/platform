import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { ValidationError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';

import { type CommandBus, type CommandContext, type CommandHandler, type HeroLedger } from '@modules/commands';
import {
  type ExpenseAuditRepository,
  type ExpenseCategoryRepository,
  type ExpenseRepository,
  FinanceCommandsService,
  type FxRateRepository,
  type SubscriptionRepository,
} from '@modules/finance';
import { type ProgressionService } from '@modules/progression';
import { type ReceiptService } from '@modules/receipts';
import { type DatabaseTransaction } from '@server/database';
import { type TelemetryService } from '@server/telemetry';

const ACCOUNT_ID = 1n;
const DATE = '2026-10-30';

function harness(homeCurrency: string) {
  const handlers = new Map<string, CommandHandler>();
  const written: Record<string, unknown>[] = [];
  const record = async (_tx: unknown, values: Record<string, unknown>) => {
    written.push(values);
    return { id: 9n, receiptRef: null, fxRate: null, ...values };
  };
  const commandBus = { registerHandler: (type: string, handler: CommandHandler) => handlers.set(type, handler) } as unknown as CommandBus;
  const service = new FinanceCommandsService(
    commandBus,
    {} as HeroLedger,
    {} as ProgressionService,
    { ensureSeeded: async () => undefined } as unknown as ExpenseCategoryRepository,
    { create: record } as unknown as ExpenseRepository,
    { removeForExpense: async () => undefined, append: async () => undefined } as unknown as ExpenseAuditRepository,
    { create: record } as unknown as SubscriptionRepository,
    { find: async () => null } as unknown as FxRateRepository,
    { emit: () => undefined } as unknown as TelemetryService,
    {} as ReceiptService,
  );
  service.onModuleInit();

  const tx = { select: () => ({ from: () => ({ where: async () => [{ defaultCurrency: homeCurrency }] }) }) } as unknown as DatabaseTransaction;
  const run = (type: string, payload: Record<string, unknown>) => {
    const handler = handlers.get(type);
    if (!handler) throw new Error(`no handler registered for '${type}'`);
    const context: CommandContext = { accountId: ACCOUNT_ID, tx, envelope: { commandId: 'c-1', type, payload, localDate: DATE } };
    return handler(context);
  };
  return { run, written };
}

const EXPENSE = { id: 'e-1', occurredOn: DATE, categoryId: 'food', amountText: '42.50', amountMinor: 4250 };
const SUBSCRIPTION = { name: 'Gym', amountText: '199', amountMinor: 19_900, frequency: 'monthly', billingDay: 1, nextDueDate: DATE, categoryId: 'health' };

describe('FinanceCommandsService currency validation', () => {
  let restoreConfig: () => void;
  beforeAll(() => (restoreConfig = setConfig({ 'telemetry.pseudo-id-secret': 'test-secret' })));
  afterAll(() => restoreConfig());

  it('should record an AED expense against an INR home currency', async () => {
    const { run, written } = harness('INR');

    const outcome = await run('expense.create', { ...EXPENSE, currency: 'AED' });

    expect(outcome.status).toBe('applied');
    expect(written[0]).toMatchObject({ currency: 'AED', fxRate: null, homeAmountMinor: null });
  });

  it('should reject an expense in a currency outside the supported list', async () => {
    const { run, written } = harness('EUR');

    await expect(run('expense.create', { ...EXPENSE, currency: 'XYZ' })).rejects.toBeInstanceOf(ValidationError);
    expect(written).toEqual([]);
  });

  it('should record an INR subscription', async () => {
    const { run, written } = harness('INR');

    const outcome = await run('subscription.create', { ...SUBSCRIPTION, currency: 'INR' });

    expect(outcome.status).toBe('applied');
    expect(written[0]).toMatchObject({ currency: 'INR' });
  });

  it('should reject a subscription in a currency outside the supported list', async () => {
    const { run, written } = harness('EUR');

    await expect(run('subscription.create', { ...SUBSCRIPTION, currency: 'XYZ' })).rejects.toBeInstanceOf(ValidationError);
    expect(written).toEqual([]);
  });
});
