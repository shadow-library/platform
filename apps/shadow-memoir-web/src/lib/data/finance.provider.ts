import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addDays, toISODate } from '@shadow-library/ui';

import { deriveCapAdvisory } from './entry-caps';
import { categoryBreakdown, convertToHomeMinor, daysBetween, monthlyEquivalentMinor, parseAmountToMinor, sumHomeMinor } from './finance.rules';
import {
  BUILT_IN_CATEGORIES,
  type CategoriesView,
  type CurrencyCode,
  type Expense,
  type ExpenseCategory,
  type ExpenseDetail,
  type ExpenseDraft,
  type ExpensePage,
  type ExpenseQuery,
  type FinanceCommand,
  type FinanceCommandResult,
  type FinanceRange,
  type FinanceSummary,
  type Subscription,
  type SubscriptionDraft,
  type SubscriptionsView,
  type UpcomingCharge,
} from './finance.types';

export interface FinanceProvider {
  summary(range: FinanceRange): Promise<FinanceSummary>;
  expenses(query: ExpenseQuery): Promise<ExpensePage>;
  expense(id: string): Promise<ExpenseDetail | null>;
  subscriptions(): Promise<SubscriptionsView>;
  categories(): Promise<CategoriesView>;
  dispatchCommand(command: FinanceCommand): Promise<FinanceCommandResult>;
}

const HOME_CURRENCY: CurrencyCode = 'EUR';

const FX_NOK_EUR = 0.086;
const FX_USD_EUR = 0.921;
const FX_GBP_EUR = 1.174;

const FX_RATES: Partial<Record<CurrencyCode, number>> = { NOK: FX_NOK_EUR, USD: FX_USD_EUR, GBP: FX_GBP_EUR };

function lockedRate(currency: CurrencyCode): number | null {
  return currency === HOME_CURRENCY ? null : (FX_RATES[currency] ?? null);
}

function today(): string {
  return toISODate(new Date());
}

function shiftDays(days: number): string {
  return toISODate(addDays(new Date(), days));
}

function at(days: number, time: string): string {
  return `${shiftDays(days)}T${time}:00`;
}

/** The whole of what a finance provider holds. The fixtures seed it; the sync layer projects it from delta rows — the readers and the command applier below are shared by both. */
export interface FinanceState {
  expenses: ExpenseDetail[];
  subscriptions: Subscription[];
  categories: ExpenseCategory[];
  receiptScansUsed: number;
  monthlyExpenseCount: number;
}

function seedExpenses(): ExpenseDetail[] {
  const draft: (Omit<ExpenseDetail, 'homeAmountMinor'> & { homeAmountMinor?: number | null })[] = [
    {
      id: 'exp-groceries',
      amountMinor: 21400,
      amountText: '214.00',
      currency: 'NOK',
      fxRate: FX_NOK_EUR,
      categoryId: 'groceries',
      merchant: 'Rema 1000 Torggata',
      note: 'Groceries — Rema 1000',
      occurredOnDate: shiftDays(0),
      loggedAt: at(0, '09:12'),
      source: 'ocr',
      syncState: 'queued',
      receipt: {
        fileName: 'REMA-1000.jpg',
        sizeBytes: 1_258_291,
        lines: [
          { label: 'Merchant', value: 'Rema 1000 Torggata', lowConfidence: false },
          { label: 'Total', value: 'kr 214.00', lowConfidence: false },
          { label: 'Date', value: '23.08.2026', lowConfidence: false },
          { label: 'VAT', value: 'kr 24.60', lowConfidence: true },
          { label: 'Card', value: '•••• 4417', lowConfidence: true },
        ],
      },
      audit: [
        { text: 'Created from quick capture · kr 214.00', when: 'today 09:12' },
        { text: 'Category changed from Uncategorised to Groceries', when: 'today 09:13' },
        { text: 'Receipt attached · 5 lines read', when: 'today 09:14' },
      ],
    },
    {
      id: 'exp-coffee',
      amountMinor: 420,
      amountText: '4.20',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'food',
      note: 'Coffee',
      occurredOnDate: shiftDays(0),
      loggedAt: at(0, '08:04'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created from quick capture · €4.20', when: 'today 08:04' }],
    },
    {
      id: 'exp-tram',
      amountMinor: 360,
      amountText: '3.60',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'transport',
      note: 'Tram — 24h pass',
      occurredOnDate: shiftDays(-1),
      loggedAt: at(-1, '17:41'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created · €3.60', when: 'yesterday 17:41' }],
    },
    {
      id: 'exp-rent',
      amountMinor: 76000,
      amountText: '760.00',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'home',
      note: 'Rent — this month',
      occurredOnDate: shiftDays(-2),
      loggedAt: at(-2, '10:00'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created · €760.00', when: '2 days ago 10:00' }],
    },
    {
      id: 'exp-shoes',
      amountMinor: 11900,
      amountText: '119.00',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'shopping',
      note: 'Running shoes',
      occurredOnDate: shiftDays(-3),
      loggedAt: at(-3, '15:20'),
      source: 'manual',
      syncState: 'synced',
      linkedQuestTitle: 'Morning run',
      linkedQuestNote: 'Linked to Morning run — buying kit does not complete a quest.',
      audit: [{ text: 'Created · €119.00', when: '3 days ago 15:20' }],
    },
    {
      id: 'exp-dinner',
      amountMinor: 4450,
      amountText: '44.50',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'food',
      note: 'Dinner out',
      occurredOnDate: shiftDays(-4),
      loggedAt: at(-4, '20:10'),
      source: 'manual',
      syncState: 'synced',
      linkedQuestTitle: 'No takeaway today',
      linkedQuestNote: 'Logged against No takeaway today. The quest records the day as missed; nothing else changes.',
      audit: [{ text: 'Created · €44.50', when: '4 days ago 20:10' }],
    },
    {
      id: 'exp-spotify',
      amountMinor: 1099,
      amountText: '10.99',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'subs',
      note: 'Spotify',
      occurredOnDate: shiftDays(-5),
      loggedAt: at(-5, '07:00'),
      source: 'manual',
      syncState: 'synced',
      linkedSubscriptionId: 'sub-spotify',
      audit: [{ text: 'Confirmed from the Spotify subscription · €10.99', when: '5 days ago 07:00' }],
    },
    {
      id: 'exp-fuel',
      amountMinor: 72500,
      amountText: '725.00',
      currency: 'NOK',
      fxRate: FX_NOK_EUR,
      categoryId: 'transport',
      note: 'Fuel',
      occurredOnDate: shiftDays(-6),
      loggedAt: at(-6, '12:35'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created · kr 725.00', when: '6 days ago 12:35' }],
    },
    {
      id: 'exp-power',
      amountMinor: 8420,
      amountText: '84.20',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'bills',
      note: 'Power — July reading',
      occurredOnDate: shiftDays(-8),
      loggedAt: at(-8, '09:00'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created · €84.20', when: '8 days ago 09:00' }],
    },
    {
      id: 'exp-uncat',
      amountMinor: 4120,
      amountText: '41.20',
      currency: 'EUR',
      fxRate: null,
      categoryId: 'uncat',
      note: 'Card payment — no note',
      occurredOnDate: shiftDays(-9),
      loggedAt: at(-9, '18:15'),
      source: 'manual',
      syncState: 'synced',
      audit: [{ text: 'Created · €41.20', when: '9 days ago 18:15' }],
    },
  ];

  return draft.map(expense => ({ ...expense, homeAmountMinor: convertToHomeMinor(expense.amountMinor, expense.currency, expense.fxRate, HOME_CURRENCY) }));
}

function subscription(input: Omit<Subscription, 'monthlyEquivalentMinor' | 'amountText' | 'billingDay' | 'createdAt'> & { createdAt?: string }): Subscription {
  return {
    ...input,
    amountText: (input.amountMinor / 100).toFixed(2),
    billingDay: Number(input.nextDueDate.slice(8, 10)),
    createdAt: input.createdAt ?? shiftDays(-400),
    monthlyEquivalentMinor: monthlyEquivalentMinor(
      convertToHomeMinor(input.amountMinor, input.currency, lockedRate(input.currency), HOME_CURRENCY) ?? input.amountMinor,
      input.frequency,
      input.customIntervalDays,
    ),
  };
}

function seedSubscriptions(): Subscription[] {
  return [
    subscription({
      id: 'sub-spotify',
      name: 'Spotify',
      amountMinor: 1099,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: shiftDays(1),
      lastConfirmedDate: shiftDays(-30),
      categoryId: 'music',
      reminderEnabled: true,
      reminderLead: '1-day',
      active: true,
    }),
    subscription({
      id: 'sub-icloud',
      name: 'iCloud 2 TB',
      amountMinor: 299,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: shiftDays(1),
      lastConfirmedDate: shiftDays(-30),
      categoryId: 'tools',
      reminderEnabled: true,
      reminderLead: '1-day',
      active: true,
    }),
    subscription({
      id: 'sub-gym',
      name: 'Gym — Oslo Sport',
      amountMinor: 3900,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: shiftDays(9),
      lastConfirmedDate: shiftDays(-21),
      categoryId: 'health',
      reminderEnabled: true,
      reminderLead: '3-day',
      active: true,
      linkedQuestTitle: 'Strength session',
    }),
    subscription({
      id: 'sub-kindle',
      name: 'Kindle Unlimited',
      amountMinor: 999,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: shiftDays(12),
      lastConfirmedDate: shiftDays(-18),
      categoryId: 'books',
      reminderEnabled: false,
      reminderLead: 'on-day',
      active: true,
      linkedQuestTitle: 'Read 20 pages',
    }),
    subscription({
      id: 'sub-domain',
      name: 'Domain — shadowmemoir.no',
      amountMinor: 16300,
      currency: 'NOK',
      frequency: 'yearly',
      nextDueDate: shiftDays(81),
      lastConfirmedDate: shiftDays(-284),
      categoryId: 'tools',
      reminderEnabled: true,
      reminderLead: '1-week',
      active: true,
    }),
    subscription({
      id: 'sub-newspaper',
      name: 'Newspaper',
      amountMinor: 633,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: shiftDays(-2),
      lastConfirmedDate: shiftDays(-32),
      categoryId: 'media',
      reminderEnabled: true,
      reminderLead: '2-day',
      active: true,
      trialEndsOn: shiftDays(11),
    }),
    subscription({
      id: 'sub-vpn',
      name: 'VPN',
      amountMinor: 4800,
      currency: 'EUR',
      frequency: 'yearly',
      nextDueDate: shiftDays(149),
      lastConfirmedDate: shiftDays(-216),
      categoryId: 'tools',
      reminderEnabled: false,
      reminderLead: 'on-day',
      active: true,
    }),
  ];
}

function createState(): FinanceState {
  return { expenses: seedExpenses(), subscriptions: seedSubscriptions(), categories: [...BUILT_IN_CATEGORIES], receiptScansUsed: 3, monthlyExpenseCount: 78 };
}

const RANGE_DAYS: Record<FinanceRange, number> = { week: 7, month: 30, year: 365 };

const RANGE_LABELS: Record<FinanceRange, string> = { week: 'This week', month: 'This month', year: 'This year' };

function withinRange(expense: Expense, range: FinanceRange): boolean {
  return daysBetween(expense.occurredOnDate, today()) < RANGE_DAYS[range];
}

function matchesSearch(expense: Expense, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return `${expense.note ?? ''} ${expense.merchant ?? ''}`.toLowerCase().includes(needle);
}

function byRecency(a: Expense, b: Expense): number {
  return a.loggedAt < b.loggedAt ? 1 : -1;
}

function nextExpenseId(): string {
  return `exp-${Date.now().toString(36)}`;
}

export function financeSummary(state: FinanceState, range: FinanceRange): FinanceSummary {
  const inRange = state.expenses.filter(expense => withinRange(expense, range));
  const spentMinor = sumHomeMinor(inRange, HOME_CURRENCY);
  const budgetMinor = range === 'month' ? 160_000 : null;
  const daysLogged = new Set(inRange.map(expense => expense.occurredOnDate)).size;
  const activeSubscriptions = state.subscriptions.filter(item => item.active);
  const nextDue = [...activeSubscriptions].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1))[0];

  return {
    range,
    periodLabel: RANGE_LABELS[range],
    homeCurrency: HOME_CURRENCY,
    spentMinor,
    spentDeltaFraction: range === 'month' ? -0.08 : null,
    comparisonLabel: range === 'month' ? 'vs the month before' : '',
    budgetMinor,
    budgetLeftMinor: budgetMinor === null ? null : budgetMinor - spentMinor,
    daysRemaining: 30 - Math.min(daysLogged, 30),
    subscriptionsMonthlyMinor: activeSubscriptions.reduce((total, item) => total + item.monthlyEquivalentMinor, 0),
    activeSubscriptions: activeSubscriptions.length,
    nextSubscriptionLabel: nextDue ? `next ${nextDue.name} on ${nextDue.nextDueDate}` : 'none scheduled',
    averageDayMinor: daysLogged > 0 ? Math.round(spentMinor / daysLogged) : 0,
    daysLogged,
    totalExpenses: state.monthlyExpenseCount,
    categories: categoryBreakdown(inRange, state.categories, HOME_CURRENCY).filter(slice => slice.count > 0),
    fxRates: [
      { from: 'NOK', to: 'EUR', rate: FX_NOK_EUR },
      { from: 'USD', to: 'EUR', rate: FX_USD_EUR },
      { from: 'GBP', to: 'EUR', rate: FX_GBP_EUR },
    ],
    receiptScansUsed: state.receiptScansUsed,
    receiptScanLimit: 10,
    receiptQuotaResetsOn: 'tomorrow',
    queuedExpense: state.expenses.find(expense => expense.syncState === 'queued') ?? null,
  };
}

export function financeExpensePage(state: FinanceState, query: ExpenseQuery): ExpensePage {
  const matched = state.expenses
    .filter(expense => withinRange(expense, query.range))
    .filter(expense => matchesSearch(expense, query.search ?? ''))
    .filter(expense => !query.categoryId || expense.categoryId === query.categoryId)
    .sort(byRecency);

  const items = query.limit ? matched.slice(0, query.limit) : matched;
  return { items, shown: items.length, total: matched.length, periodLabel: RANGE_LABELS[query.range], homeCurrency: HOME_CURRENCY };
}

export function financeSubscriptionsView(state: FinanceState): SubscriptionsView {
  const items = [...state.subscriptions].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));
  const active = items.filter(item => item.active);
  const monthlyTotalMinor = active.reduce((total, item) => total + item.monthlyEquivalentMinor, 0);

  const upcoming: UpcomingCharge[] = active
    .filter(item => daysBetween(today(), item.nextDueDate) <= 30)
    .map(item => ({ subscriptionId: item.id, name: item.name, dueDate: item.nextDueDate, amountMinor: item.amountMinor, currency: item.currency }));

  const byDate = new Map<string, UpcomingCharge[]>();
  for (const charge of upcoming) byDate.set(charge.dueDate, [...(byDate.get(charge.dueDate) ?? []), charge]);

  const collisions = [...byDate.entries()]
    .filter(([, charges]) => charges.length > 1)
    .map(([date, charges]) => ({
      date,
      names: charges.map(charge => charge.name),
      totalMinor: charges.reduce((total, charge) => total + (convertToHomeMinor(charge.amountMinor, charge.currency, lockedRate(charge.currency), HOME_CURRENCY) ?? 0), 0),
    }));

  return { items, homeCurrency: HOME_CURRENCY, activeCount: active.length, monthlyTotalMinor, yearlyTotalMinor: monthlyTotalMinor * 12, upcoming, collisions };
}

export function financeCategoriesView(state: FinanceState): CategoriesView {
  const inRange = state.expenses.filter(expense => withinRange(expense, 'month'));
  const items = categoryBreakdown(inRange, state.categories, HOME_CURRENCY);
  const uncategorised = items.find(slice => slice.category.id === 'uncat');
  return { items, homeCurrency: HOME_CURRENCY, uncategorised: { count: uncategorised?.count ?? 0, totalMinor: uncategorised?.totalMinor ?? 0 } };
}

function buildExpense(id: string, draft: ExpenseDraft): ExpenseDetail {
  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency) ?? 0;
  const fxRate = lockedRate(draft.currency);
  return {
    id,
    amountMinor,
    amountText: draft.amountText,
    currency: draft.currency,
    fxRate,
    homeAmountMinor: convertToHomeMinor(amountMinor, draft.currency, fxRate, HOME_CURRENCY),
    categoryId: draft.categoryId,
    merchant: draft.merchant,
    note: draft.note,
    occurredOnDate: draft.occurredOnDate,
    loggedAt: new Date().toISOString(),
    source: draft.source ?? 'manual',
    syncState: 'synced',
    audit: [{ text: 'Created', when: 'just now' }],
  };
}

function createExpense(state: FinanceState, draft: ExpenseDraft): FinanceCommandResult {
  const expense = buildExpense(draft.id ?? nextExpenseId(), draft);
  state.expenses = [expense, ...state.expenses];
  state.monthlyExpenseCount += 1;
  if (draft.source === 'ocr') state.receiptScansUsed += 1;
  return { id: expense.id, message: 'Expense saved.', advisory: deriveCapAdvisory('expenses', state.monthlyExpenseCount) };
}

function updateExpense(state: FinanceState, id: string, draft: ExpenseDraft): FinanceCommandResult {
  state.expenses = state.expenses.map(expense =>
    expense.id === id ? { ...buildExpense(id, draft), audit: [...expense.audit, { text: 'Edited', when: 'just now' }], loggedAt: expense.loggedAt } : expense,
  );
  return { id, message: 'Expense updated.' };
}

function createSubscription(state: FinanceState, draft: SubscriptionDraft): FinanceCommandResult {
  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency) ?? 0;
  const created = subscription({
    id: `sub-${Date.now().toString(36)}`,
    name: draft.name,
    note: draft.note,
    amountMinor,
    currency: draft.currency,
    frequency: draft.frequency,
    customIntervalDays: draft.customIntervalDays,
    nextDueDate: draft.nextDueDate,
    lastConfirmedDate: null,
    categoryId: draft.categoryId,
    reminderEnabled: draft.reminderEnabled,
    reminderLead: draft.reminderLead,
    active: true,
  });
  state.subscriptions = [...state.subscriptions, created];
  return { id: created.id, message: 'Subscription added. It will prepare an expense for you to confirm when it comes due.' };
}

/**
 * Confirm-on-fire, idempotent per cycle: a second confirmation of the same billing date finds the
 * expense already written and reports it rather than logging the charge twice.
 */
function confirmCycle(state: FinanceState, id: string, billingDate: string): FinanceCommandResult {
  const target = state.subscriptions.find(item => item.id === id);
  if (!target) return { id, message: 'That subscription is no longer here.' };

  const existing = state.expenses.find(expense => expense.linkedSubscriptionId === id && expense.occurredOnDate === billingDate);
  if (existing) return { id: existing.id, message: 'Already confirmed for this cycle.' };

  const expense = buildExpense(nextExpenseId(), {
    amountText: target.amountText,
    currency: target.currency,
    categoryId: 'subs',
    occurredOnDate: billingDate,
    note: target.name,
  });
  state.expenses = [{ ...expense, linkedSubscriptionId: id }, ...state.expenses];
  state.subscriptions = state.subscriptions.map(item => (item.id === id ? { ...item, lastConfirmedDate: billingDate } : item));
  return { id: expense.id, message: `${target.name} confirmed for ${billingDate}.` };
}

/** The optimistic apply, shared by the fixtures and by the sync layer's replay of what is still queued. */
export function applyFinanceCommand(state: FinanceState, command: FinanceCommand): FinanceCommandResult {
  switch (command.type) {
    case 'expense.create':
      return createExpense(state, command.draft);
    case 'expense.update':
      return updateExpense(state, command.id, command.draft);
    case 'expense.delete':
      state.expenses = state.expenses.filter(expense => expense.id !== command.id);
      return { id: command.id, message: 'Expense deleted.' };
    case 'subscription.create':
      return createSubscription(state, command.draft);
    case 'subscription.setActive':
      state.subscriptions = state.subscriptions.map(item => (item.id === command.id ? { ...item, active: command.active } : item));
      return { id: command.id, message: command.active ? 'Subscription resumed.' : 'Subscription paused.' };
    case 'subscription.confirmCycle':
      return confirmCycle(state, command.id, command.billingDate);
    case 'category.rename':
      state.categories = state.categories.map(category => (category.id === command.id ? { ...category, name: command.name } : category));
      return { id: command.id, message: 'Renamed. Every past expense follows the new name; the amounts are untouched.' };
    case 'category.setArchived':
      state.categories = state.categories.map(category => (category.id === command.id ? { ...category, archived: command.archived } : category));
      return { id: command.id, message: command.archived ? 'Archived. It is hidden from new entries and kept in Insights.' : 'Restored.' };
  }
}

export class FixtureFinanceProvider implements FinanceProvider {
  private readonly state = createState();

  async summary(range: FinanceRange): Promise<FinanceSummary> {
    return financeSummary(this.state, range);
  }

  async expenses(query: ExpenseQuery): Promise<ExpensePage> {
    return financeExpensePage(this.state, query);
  }

  async expense(id: string): Promise<ExpenseDetail | null> {
    return this.state.expenses.find(expense => expense.id === id) ?? null;
  }

  async subscriptions(): Promise<SubscriptionsView> {
    return financeSubscriptionsView(this.state);
  }

  async categories(): Promise<CategoriesView> {
    return financeCategoriesView(this.state);
  }

  async dispatchCommand(command: FinanceCommand): Promise<FinanceCommandResult> {
    return applyFinanceCommand(this.state, command);
  }
}

let provider: FinanceProvider = new FixtureFinanceProvider();

export function setFinanceProvider(next: FinanceProvider): void {
  provider = next;
}

export function getFinanceProvider(): FinanceProvider {
  return provider;
}

export const financeKeys = {
  all: ['finance'] as const,
  summary: (range: FinanceRange) => ['finance', 'summary', range] as const,
  expenses: (query: ExpenseQuery) => ['finance', 'expenses', query] as const,
  expense: (id: string) => ['finance', 'expense', id] as const,
  subscriptions: () => ['finance', 'subscriptions'] as const,
  categories: () => ['finance', 'categories'] as const,
};

const financeSummaryQuery = (range: FinanceRange) => queryOptions({ queryKey: financeKeys.summary(range), queryFn: () => provider.summary(range) });

const expensesQuery = (query: ExpenseQuery) => queryOptions({ queryKey: financeKeys.expenses(query), queryFn: () => provider.expenses(query) });

const expenseQuery = (id: string) => queryOptions({ queryKey: financeKeys.expense(id), queryFn: () => provider.expense(id) });

const subscriptionsQuery = () => queryOptions({ queryKey: financeKeys.subscriptions(), queryFn: () => provider.subscriptions() });

const expenseCategoriesQuery = () => queryOptions({ queryKey: financeKeys.categories(), queryFn: () => provider.categories() });

export function useFinanceSummary(range: FinanceRange): UseQueryResult<FinanceSummary> {
  return useQuery(financeSummaryQuery(range));
}

export function useExpenses(query: ExpenseQuery): UseQueryResult<ExpensePage> {
  return useQuery(expensesQuery(query));
}

export function useExpense(id: string): UseQueryResult<ExpenseDetail | null> {
  return useQuery(expenseQuery(id));
}

export function useSubscriptions(): UseQueryResult<SubscriptionsView> {
  return useQuery(subscriptionsQuery());
}

export function useExpenseCategories(): UseQueryResult<CategoriesView> {
  return useQuery(expenseCategoriesQuery());
}

export function useFinanceCommand(): UseMutationResult<FinanceCommandResult, Error, FinanceCommand> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: FinanceCommand) => provider.dispatchCommand(command),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export { HOME_CURRENCY };
