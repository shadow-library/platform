/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { AppError, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { CommandBus, type CommandContext, type CommandResult, HeroLedger } from '@modules/commands';
import { AppErrorCode } from '@server/classes';
import { type DatabaseTransaction, type Expense, schema, type Subscription } from '@server/database';

import { ExpenseCategoryRepository } from './expense-category.repository';
import { ExpenseRepository } from './expense.repository';
import { FxRateRepository } from './fx-rate.repository';
import { advanceDueDate } from './subscription-cycle';
import { SubscriptionRepository } from './subscription.repository';

/**
 * Defining types
 */

interface FxCapture {
  fxRate: string | null;
  homeAmountMinor: bigint | null;
  fxRateDate: string | null;
}

/**
 * Declaring the constants
 */

const EXPENSE_CREATE = 'expense.create';
const EXPENSE_UPDATE = 'expense.update';
const EXPENSE_DELETE = 'expense.delete';
const SUBSCRIPTION_CREATE = 'subscription.create';
const SUBSCRIPTION_UPDATE = 'subscription.update';
const SUBSCRIPTION_DELETE = 'subscription.delete';
const SUBSCRIPTION_CONFIRM_CYCLE = 'subscription.confirmCycle';

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) {
    const error = new ValidationError();
    error.addFieldError(field, `'${field}' is required`);
    throw error;
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  return typeof value === 'string' ? value : undefined;
}

function requireEnum<T extends string>(payload: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requireString(payload, field);
  if (!(allowed as readonly string[]).includes(value)) {
    const error = new ValidationError();
    error.addFieldError(field, `'${field}' must be one of ${allowed.join(', ')}`);
    throw error;
  }
  return value as T;
}

const SUBSCRIPTION_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as const;
const REMINDER_LEADS = ['on_day', '1_day', '2_day', '3_day', '1_week'] as const;
const EXPENSE_SOURCES = ['manual', 'ocr'] as const;

function requireAmountMinor(payload: Record<string, unknown>, field = 'amountMinor'): bigint {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    const error = new ValidationError();
    error.addFieldError(field, `'${field}' must be an integer number of minor units`);
    throw error;
  }
  return BigInt(value);
}

function optionalAmountMinor(payload: Record<string, unknown>, field = 'amountMinor'): bigint | undefined {
  return field in payload ? requireAmountMinor(payload, field) : undefined;
}

/** Monthly-equivalent precompute (ARCHITECTURE §10.3): fast amortized reporting without re-deriving it per read. */
function monthlyEquivalentMinor(amountMinor: bigint, frequency: string, customIntervalDays: number | null): bigint {
  if (frequency === 'weekly') return (amountMinor * 52n) / 12n;
  if (frequency === 'quarterly') return amountMinor / 3n;
  if (frequency === 'yearly') return amountMinor / 12n;
  if (frequency === 'custom') return (amountMinor * 30n) / BigInt(customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30);
  return amountMinor;
}

/**
 * Registers the expense/subscription command handlers (ARCHITECTURE §14.1–14.2) on the shared
 * `CommandBus` and their delta sources on the sync assembler, mirroring `DeviceService`'s
 * `OnModuleInit` registration shape. Every handler runs inside the command's own transaction — the
 * account already serialized by `CommandBus.execute`'s advisory lock — so a category seed, an FX
 * capture, and the entity write commit atomically or not at all.
 */
@Injectable()
export class FinanceCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly heroLedger: HeroLedger,
    private readonly expenseCategoryRepository: ExpenseCategoryRepository,
    private readonly expenseRepository: ExpenseRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly fxRateRepository: FxRateRepository,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler(EXPENSE_CREATE, context => this.createExpense(context));
    this.commandBus.registerHandler(EXPENSE_UPDATE, context => this.updateExpense(context));
    this.commandBus.registerHandler(EXPENSE_DELETE, context => this.deleteExpense(context));
    this.commandBus.registerHandler(SUBSCRIPTION_CREATE, context => this.createSubscription(context));
    this.commandBus.registerHandler(SUBSCRIPTION_UPDATE, context => this.updateSubscription(context));
    this.commandBus.registerHandler(SUBSCRIPTION_DELETE, context => this.deleteSubscription(context));
    this.commandBus.registerHandler(SUBSCRIPTION_CONFIRM_CYCLE, context => this.confirmSubscriptionCycle(context));
  }

  private async defaultCurrencyOf(tx: DatabaseTransaction, accountId: bigint): Promise<string> {
    const [account] = await tx.select({ defaultCurrency: schema.accounts.defaultCurrency }).from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return account?.defaultCurrency ?? 'USD';
  }

  /**
   * Capture-at-entry (ARCHITECTURE §14.1): reads the shared `fx_rates` cache the reconciliation sweep
   * maintains for `occurredOn`'s date, never calls the provider itself — a live external call at write
   * time would make entry blocking, which S3/S21 forbid outright. A same-currency expense needs no
   * conversion at all.
   */
  private async captureFx(tx: DatabaseTransaction, currency: string, defaultCurrency: string, occurredOn: string, amountMinor: bigint): Promise<FxCapture> {
    if (currency === defaultCurrency) return { fxRate: null, homeAmountMinor: null, fxRateDate: null };

    const cached = await this.fxRateRepository.find(tx, occurredOn, currency, defaultCurrency);
    if (!cached?.rate) return { fxRate: null, homeAmountMinor: null, fxRateDate: null };

    const homeAmountMinor = BigInt(Math.round(Number(amountMinor) * Number(cached.rate)));
    return { fxRate: cached.rate, homeAmountMinor, fxRateDate: occurredOn };
  }

  private async createExpense({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = requireString(payload, 'id');
    const currency = requireString(payload, 'currency').toUpperCase();
    const occurredOn = requireString(payload, 'occurredOn');
    const categoryId = requireString(payload, 'categoryId');
    const amountText = requireString(payload, 'amountText');
    const amountMinor = requireAmountMinor(payload);
    const source: Expense.Source = 'source' in payload ? requireEnum(payload, 'source', EXPENSE_SOURCES) : 'manual';

    await this.expenseCategoryRepository.ensureSeeded(tx, accountId);
    const defaultCurrency = await this.defaultCurrencyOf(tx, accountId);
    const fx = await this.captureFx(tx, currency, defaultCurrency, occurredOn, amountMinor);

    const expense = await this.expenseRepository.create(tx, {
      id,
      accountId,
      amountMinor,
      amountText,
      currency,
      categoryId,
      occurredOn,
      source,
      merchant: optionalString(payload, 'merchant') ?? null,
      note: optionalString(payload, 'note') ?? null,
      receiptRef: optionalString(payload, 'receiptRef') ?? null,
      lineItems: payload['lineItems'] ?? null,
      linkedQuestId: null,
      linkedSubscriptionId: null,
      billingCycleDate: null,
      ...fx,
    });

    return { status: 'applied', result: { id: expense.id } };
  }

  private async updateExpense({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = requireString(payload, 'id');
    const existing = await this.expenseRepository.findByIdInTx(tx, id);
    if (!existing) throw AppErrorCode.FIN_003.create();

    const newCurrency = optionalString(payload, 'currency');
    if (newCurrency !== undefined && newCurrency.toUpperCase() !== existing.currency) throw AppErrorCode.FIN_006.create();

    const newAmountMinor = optionalAmountMinor(payload);
    const values: Record<string, unknown> = {};
    if (newAmountMinor !== undefined) values['amountMinor'] = newAmountMinor;
    const newAmountText = optionalString(payload, 'amountText');
    if (newAmountText !== undefined) values['amountText'] = newAmountText;
    const newCategoryId = optionalString(payload, 'categoryId');
    if (newCategoryId !== undefined) values['categoryId'] = newCategoryId;
    const newOccurredOn = optionalString(payload, 'occurredOn');
    if (newOccurredOn !== undefined) values['occurredOn'] = newOccurredOn;
    if ('merchant' in payload) values['merchant'] = optionalString(payload, 'merchant') ?? null;
    if ('note' in payload) values['note'] = optionalString(payload, 'note') ?? null;

    /** The locked rate never re-fetches (ARCHITECTURE §14.1); an amount edit recomputes `home_amount_minor` under it, in place, without touching `fx_rate`/`fx_rate_date`. */
    if (newAmountMinor !== undefined && existing.fxRate !== null) {
      values['homeAmountMinor'] = BigInt(Math.round(Number(newAmountMinor) * Number(existing.fxRate)));
    }

    const updated = await this.expenseRepository.update(tx, id, values);
    if (!updated) throw AppErrorCode.FIN_003.create();
    return { status: 'applied', result: { id: updated.id } };
  }

  private async deleteExpense({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const id = requireString(envelope.payload, 'id');
    const removed = await this.expenseRepository.remove(tx, id);
    if (!removed) throw AppErrorCode.FIN_003.create();
    return { status: 'applied', result: { id } };
  }

  private async createSubscription({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const name = requireString(payload, 'name');
    const amountMinor = requireAmountMinor(payload);
    const amountText = requireString(payload, 'amountText');
    const currency = requireString(payload, 'currency').toUpperCase();
    const frequency: Subscription.Frequency = requireEnum(payload, 'frequency', SUBSCRIPTION_FREQUENCIES);
    const billingDay = Number(payload['billingDay']);
    const nextDueDate = requireString(payload, 'nextDueDate');
    const categoryId = requireString(payload, 'categoryId');
    const customIntervalDays = typeof payload['customIntervalDays'] === 'number' ? (payload['customIntervalDays'] as number) : null;
    const reminderLead: Subscription.ReminderLead = 'reminderLead' in payload ? requireEnum(payload, 'reminderLead', REMINDER_LEADS) : 'on_day';

    await this.expenseCategoryRepository.ensureSeeded(tx, accountId);

    const subscription = await this.subscriptionRepository.create(tx, {
      accountId,
      name,
      note: optionalString(payload, 'note') ?? null,
      amountMinor,
      amountText,
      currency,
      frequency,
      customIntervalDays,
      billingDay,
      nextDueDate,
      categoryId,
      reminderEnabled: payload['reminderEnabled'] === true,
      reminderLead,
      monthlyEquivalentMinor: monthlyEquivalentMinor(amountMinor, frequency, customIntervalDays),
    });

    return { status: 'applied', result: { id: String(subscription.id) } };
  }

  private async updateSubscription({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = BigInt(requireString(payload, 'id'));
    const existing = await this.subscriptionRepository.findById(id);
    if (!existing) throw AppErrorCode.FIN_004.create();

    const values: Record<string, unknown> = {};
    if ('name' in payload) values['name'] = requireString(payload, 'name');
    if ('note' in payload) values['note'] = optionalString(payload, 'note') ?? null;
    if ('amountText' in payload) values['amountText'] = requireString(payload, 'amountText');
    if ('billingDay' in payload) values['billingDay'] = Number(payload['billingDay']);
    if ('nextDueDate' in payload) values['nextDueDate'] = requireString(payload, 'nextDueDate');
    if ('categoryId' in payload) values['categoryId'] = requireString(payload, 'categoryId');
    if ('reminderEnabled' in payload) values['reminderEnabled'] = payload['reminderEnabled'] === true;
    if ('reminderLead' in payload) values['reminderLead'] = requireEnum(payload, 'reminderLead', REMINDER_LEADS);
    if ('active' in payload) values['active'] = payload['active'] === true;
    if ('frequency' in payload) values['frequency'] = requireEnum(payload, 'frequency', SUBSCRIPTION_FREQUENCIES);
    if ('customIntervalDays' in payload) values['customIntervalDays'] = typeof payload['customIntervalDays'] === 'number' ? payload['customIntervalDays'] : null;

    const amountMinor = optionalAmountMinor(payload);
    if (amountMinor !== undefined) values['amountMinor'] = amountMinor;

    if (amountMinor !== undefined || 'frequency' in payload || 'customIntervalDays' in payload) {
      const frequency = (values['frequency'] as string | undefined) ?? existing.frequency;
      const customIntervalDays = 'customIntervalDays' in values ? (values['customIntervalDays'] as number | null) : existing.customIntervalDays;
      const amount = amountMinor ?? existing.amountMinor;
      values['monthlyEquivalentMinor'] = monthlyEquivalentMinor(amount, frequency, customIntervalDays);
    }

    const updated = await this.subscriptionRepository.update(tx, id, values);
    if (!updated) throw AppErrorCode.FIN_004.create();
    return { status: 'applied', result: { id: String(updated.id) } };
  }

  private async deleteSubscription({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const id = BigInt(requireString(envelope.payload, 'id'));
    const removed = await this.subscriptionRepository.remove(tx, id);
    if (!removed) throw AppErrorCode.FIN_004.create();
    return { status: 'applied', result: { id: String(id) } };
  }

  /**
   * Confirm-on-fire (ARCHITECTURE §14.2). The account is already serialized end to end by
   * `CommandBus.execute`'s advisory lock, so two devices confirming the same cycle under different
   * command ids never literally race inside Postgres — the second's transaction blocks behind the
   * first's, then observes the first's committed expense row and converges via the partial unique
   * constraint rather than duplicating it. `FOR UPDATE` on the subscription row is defense in depth for
   * any future caller that reaches this outside the command path.
   */
  private async confirmSubscriptionCycle({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const subscriptionId = BigInt(requireString(payload, 'id'));
    const billingDate = requireString(payload, 'billingDate');

    const subscription = await this.subscriptionRepository.findByIdForUpdateInTx(tx, subscriptionId);
    if (!subscription) throw AppErrorCode.FIN_004.create();

    const defaultCurrency = await this.defaultCurrencyOf(tx, accountId);
    const fx = await this.captureFx(tx, subscription.currency, defaultCurrency, billingDate, subscription.amountMinor);

    const expenseId = optionalString(payload, 'expenseId') ?? Bun.randomUUIDv7();
    const [inserted] = await tx
      .insert(schema.expenses)
      .values({
        id: expenseId,
        accountId,
        amountMinor: subscription.amountMinor,
        amountText: subscription.amountText,
        currency: subscription.currency,
        categoryId: subscription.categoryId,
        note: subscription.note,
        occurredOn: billingDate,
        source: 'manual',
        linkedSubscriptionId: subscriptionId,
        billingCycleDate: billingDate,
        ...fx,
      })
      .onConflictDoNothing({
        target: [schema.expenses.accountId, schema.expenses.linkedSubscriptionId, schema.expenses.billingCycleDate],
        where: eq(schema.expenses.linkedSubscriptionId, subscriptionId),
      })
      .returning();

    let expense = inserted;
    if (!expense) {
      const [existing] = await tx
        .select()
        .from(schema.expenses)
        .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.linkedSubscriptionId, subscriptionId), eq(schema.expenses.billingCycleDate, billingDate)));
      expense = existing;
    } else {
      const nextDueDate = advanceDueDate(subscription, billingDate);
      await this.subscriptionRepository.advanceCycle(tx, subscriptionId, billingDate, nextDueDate);
    }
    if (!expense) throw AppErrorCode.FIN_002.create();

    const grants = await this.heroLedger.grant(tx, accountId, [{ dedupeKey: `sub_${subscriptionId}_${billingDate}`, type: 'coin_grant', date: billingDate, coinsDelta: 1 }]);
    const grant = grants[0];
    if (!grant) throw AppError.internal(`HeroLedger.grant returned no outcome for subscription '${subscriptionId}' cycle '${billingDate}'`);

    return { status: 'applied', result: { expenseId: expense.id, coinsGranted: grant.coinsDelta } };
  }
}
