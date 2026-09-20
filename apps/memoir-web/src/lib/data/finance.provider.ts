import { addDays, toISODate } from '@shadow-library/ui';

import { type DispatchOptions } from './command.types';
import { deriveCapAdvisory } from './entry-caps';
import {
  budgetStanding,
  categoryBreakdown,
  compareExpensesByDate,
  convertToHomeMinor,
  daysBetween,
  deriveDueState,
  expenseChanges,
  financePeriod,
  latestRates,
  monthlyEquivalentMinor,
  parseAmountToMinor,
  previousStretch,
  rateFromSnapshots,
  ratesUsed,
  spendDelta,
  sumHomeMinor,
  withinSpan,
} from './finance.rules';
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
  type ExpenseView,
  type FinanceCommand,
  type FinanceCommandResult,
  type FinanceRange,
  type FinanceSettings,
  type FinanceSummary,
  type FxRateSnapshot,
  type RangeSpend,
  type ReceiptLink,
  type ReceiptScanQuota,
  type ReceiptUploadProgress,
  type Subscription,
  SUBSCRIPTION_CATEGORIES,
  type SubscriptionCollision,
  type SubscriptionDraft,
  type SubscriptionHighlight,
  type SubscriptionsView,
  type UnconvertedSubscriptions,
  type UpcomingCharge,
} from './finance.types';

export interface FinanceProvider {
  summary(): Promise<FinanceSummary>;
  expenses(query: ExpenseQuery): Promise<ExpensePage>;
  expense(id: string): Promise<ExpenseView>;
  subscriptions(): Promise<SubscriptionsView>;
  categories(): Promise<CategoriesView>;
  receiptScanQuota(): Promise<ReceiptScanQuota>;
  /** Uploads a receipt photo without confirming it, resolving with its ref. */
  uploadReceipt(file: File, progress: ReceiptUploadProgress): Promise<string>;
  /** Marks an uploaded receipt as kept; called only once the owner saves the expense that carries it. */
  confirmReceipt(ref: string): Promise<void>;
  /** A presigned link to a stored receipt photo; it stops working at `expiresAt`. */
  receiptLink(ref: string): Promise<ReceiptLink>;
  dispatchCommand(command: FinanceCommand, options?: DispatchOptions): Promise<FinanceCommandResult>;
}

const FIXTURE_HOME_CURRENCY: CurrencyCode = 'EUR';

const FX_NOK_EUR = 0.086;
const FX_USD_EUR = 0.921;
const FX_GBP_EUR = 1.174;

const FX_RATES: Partial<Record<CurrencyCode, number>> = { NOK: FX_NOK_EUR, USD: FX_USD_EUR, GBP: FX_GBP_EUR };

function fixtureRate(currency: CurrencyCode): number | null {
  return currency === FIXTURE_HOME_CURRENCY ? null : (FX_RATES[currency] ?? null);
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
  today: string;
  settings: FinanceSettings;
  expenses: ExpenseDetail[];
  subscriptions: Subscription[];
  categories: ExpenseCategory[];
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
        { id: 'exp-groceries-1', action: 'created', changes: [], at: at(0, '09:12') },
        { id: 'exp-groceries-2', action: 'updated', changes: [{ field: 'categoryId', from: 'uncat', to: 'groceries' }], at: at(0, '09:13') },
        { id: 'exp-groceries-3', action: 'receipt_confirmed', changes: [], at: at(0, '09:14') },
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
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
      audit: [],
    },
  ];

  return draft.map(expense => ({
    ...expense,
    homeAmountMinor: convertToHomeMinor(expense.amountMinor, expense.currency, expense.fxRate, FIXTURE_HOME_CURRENCY),
    audit: expense.audit.length > 0 ? expense.audit : [{ id: `${expense.id}-created`, action: 'created', changes: [], at: expense.loggedAt }],
  }));
}

function subscription(
  input: Omit<Subscription, 'monthlyEquivalentMinor' | 'amountText' | 'billingDay' | 'createdAt' | 'expenseCategoryId'> & { createdAt?: string },
): Subscription {
  return {
    ...input,
    expenseCategoryId: SUBSCRIPTION_CATEGORIES[input.categoryId].expenseCategoryId,
    amountText: (input.amountMinor / 100).toFixed(2),
    billingDay: Number(input.nextDueDate.slice(8, 10)),
    createdAt: input.createdAt ?? shiftDays(-400),
    monthlyEquivalentMinor: monthlyEquivalentMinor(
      convertToHomeMinor(input.amountMinor, input.currency, fixtureRate(input.currency), FIXTURE_HOME_CURRENCY) ?? input.amountMinor,
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
      name: 'Domain — memoir.no',
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
  return {
    today: today(),
    settings: { homeCurrency: FIXTURE_HOME_CURRENCY, currencies: ['EUR', 'NOK', 'USD'], weekStartsOn: 1, monthlyBudgetMinor: 160_000 },
    expenses: seedExpenses(),
    subscriptions: seedSubscriptions(),
    categories: [...BUILT_IN_CATEGORIES],
    monthlyExpenseCount: 78,
  };
}

const RANGE_LABELS: Record<FinanceRange, string> = { week: 'This week', month: 'This month', year: 'This year' };

const COMPARISON_LABELS: Record<FinanceRange, string> = { week: 'the same days last week', month: 'the same days last month', year: 'the same stretch last year' };

function inPeriod(state: FinanceState, range: FinanceRange): Expense[] {
  const period = financePeriod(range, state.today);
  return state.expenses.filter(expense => withinSpan(expense.occurredOnDate, period));
}

function matchesSearch(expense: Expense, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return `${expense.note ?? ''} ${expense.merchant ?? ''}`.toLowerCase().includes(needle);
}

function nextExpenseId(): string {
  return `exp-${Date.now().toString(36)}`;
}

function rangeSpend(state: FinanceState, range: FinanceRange): RangeSpend {
  const { settings } = state;
  const home = settings.homeCurrency;
  const inRange = inPeriod(state, range);
  const spentMinor = sumHomeMinor(inRange, home);
  const soFarMinor = sumHomeMinor(
    inRange.filter(expense => expense.occurredOnDate <= state.today),
    home,
  );
  const previous = previousStretch(range, state.today);
  const previousMinor = sumHomeMinor(
    state.expenses.filter(expense => withinSpan(expense.occurredOnDate, previous)),
    home,
  );
  const daysLogged = new Set(inRange.map(expense => expense.occurredOnDate)).size;

  return {
    range,
    periodLabel: RANGE_LABELS[range],
    spentMinor,
    spentDeltaFraction: spendDelta(soFarMinor, previousMinor),
    comparisonLabel: COMPARISON_LABELS[range],
    averageDayMinor: daysLogged > 0 ? Math.round(spentMinor / daysLogged) : 0,
    daysLogged,
    categories: categoryBreakdown(inRange, state.categories, home).filter(slice => slice.count > 0),
    fxRates: ratesUsed(inRange, home),
  };
}

function subscriptionHomeEquivalentMinor(
  subscription: Pick<Subscription, 'monthlyEquivalentMinor' | 'currency'>,
  homeCurrency: CurrencyCode,
  rates: FxRateSnapshot[],
): number | null {
  return convertToHomeMinor(subscription.monthlyEquivalentMinor, subscription.currency, rateFromSnapshots(subscription.currency, homeCurrency, rates), homeCurrency);
}

interface SubscriptionTotals {
  homeMinor: number;
  unconverted: UnconvertedSubscriptions;
}

/** Converts every active subscription once; a currency with no known rate is excluded from the sum, never counted as 0. */
function subscriptionTotals(subscriptions: Subscription[], homeCurrency: CurrencyCode, rates: FxRateSnapshot[]): SubscriptionTotals {
  const converted = subscriptions.map(item => ({ item, homeMinor: subscriptionHomeEquivalentMinor(item, homeCurrency, rates) }));
  const unresolved = converted.filter((entry): entry is { item: Subscription; homeMinor: null } => entry.homeMinor === null).map(entry => entry.item);
  return {
    homeMinor: converted.reduce((total, entry) => total + (entry.homeMinor ?? 0), 0),
    unconverted: { count: unresolved.length, currencies: [...new Set(unresolved.map(item => item.currency))] },
  };
}

function byDueDate(a: Subscription, b: Subscription): number {
  return a.nextDueDate < b.nextDueDate ? -1 : 1;
}

function subscriptionHighlight(active: Subscription[], today: string): SubscriptionHighlight | null {
  const overdue = active.filter(item => deriveDueState(item, today) === 'overdue').sort(byDueDate);
  const [oldest] = overdue;
  if (oldest) return { kind: 'overdue', name: oldest.name, dueDate: oldest.nextDueDate, count: overdue.length };
  const next = active.filter(item => item.nextDueDate >= today && !(item.lastConfirmedDate && item.lastConfirmedDate >= item.nextDueDate)).sort(byDueDate)[0];
  return next ? { kind: 'next', name: next.name, dueDate: next.nextDueDate } : null;
}

export function financeSummary(state: FinanceState): FinanceSummary {
  const home = state.settings.homeCurrency;
  const activeSubscriptions = state.subscriptions.filter(item => item.active);
  const rates = latestRates(state.expenses, home);
  const totals = subscriptionTotals(activeSubscriptions, home, rates);

  return {
    settings: state.settings,
    categories: state.categories,
    ranges: { week: rangeSpend(state, 'week'), month: rangeSpend(state, 'month'), year: rangeSpend(state, 'year') },
    budget: budgetStanding(state.expenses, state.settings, state.today),
    subscriptionsMonthlyMinor: totals.homeMinor,
    unconvertedSubscriptions: totals.unconverted,
    activeSubscriptions: activeSubscriptions.length,
    subscriptionHighlight: subscriptionHighlight(activeSubscriptions, state.today),
    totalExpenses: state.monthlyExpenseCount,
    latestRates: rates,
    queuedExpense: state.expenses.find(expense => expense.syncState === 'queued') ?? null,
  };
}

export function financeExpensePage(state: FinanceState, query: ExpenseQuery): ExpensePage {
  const matched = inPeriod(state, query.range)
    .filter(expense => matchesSearch(expense, query.search ?? ''))
    .filter(expense => !query.categoryId || expense.categoryId === query.categoryId)
    .sort(compareExpensesByDate);

  const items = query.limit ? matched.slice(0, query.limit) : matched;
  return { items, shown: items.length, total: matched.length, periodLabel: RANGE_LABELS[query.range], homeCurrency: state.settings.homeCurrency };
}

export function financeExpenseView(state: FinanceState, id: string): ExpenseView {
  return {
    expense: state.expenses.find(expense => expense.id === id) ?? null,
    settings: state.settings,
    categories: state.categories,
    rates: latestRates(state.expenses, state.settings.homeCurrency),
  };
}

export function financeSubscriptionsView(state: FinanceState): SubscriptionsView {
  const home = state.settings.homeCurrency;
  const rates = latestRates(state.expenses, home);
  const items = [...state.subscriptions].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));
  const active = items.filter(item => item.active);
  const totals = subscriptionTotals(active, home, rates);

  const upcoming: UpcomingCharge[] = active
    .filter(item => {
      const days = daysBetween(state.today, item.nextDueDate);
      return days >= 0 && days <= 30;
    })
    .map(item => ({ subscriptionId: item.id, name: item.name, dueDate: item.nextDueDate, amountMinor: item.amountMinor, currency: item.currency }));

  const byDate = new Map<string, UpcomingCharge[]>();
  for (const charge of upcoming) byDate.set(charge.dueDate, [...(byDate.get(charge.dueDate) ?? []), charge]);

  const collisions: SubscriptionCollision[] = [...byDate.entries()]
    .filter(([, charges]) => charges.length > 1)
    .map(([date, charges]) => {
      const converted = charges.map(charge => ({
        charge,
        homeMinor: convertToHomeMinor(charge.amountMinor, charge.currency, rateFromSnapshots(charge.currency, home, rates), home),
      }));
      const known = converted.filter((entry): entry is { charge: UpcomingCharge; homeMinor: number } => entry.homeMinor !== null);
      const unconvertedCharges = converted.filter(entry => entry.homeMinor === null).map(entry => ({ currency: entry.charge.currency, amountMinor: entry.charge.amountMinor }));
      return {
        date,
        names: charges.map(charge => charge.name),
        totalMinor: known.length > 0 ? known.reduce((total, entry) => total + entry.homeMinor, 0) : null,
        unconvertedCharges,
      };
    });

  return {
    items,
    categories: state.categories,
    homeCurrency: home,
    settings: state.settings,
    activeCount: active.length,
    monthlyTotalMinor: totals.homeMinor,
    yearlyTotalMinor: totals.homeMinor * 12,
    upcoming,
    collisions,
    rates,
    unconverted: totals.unconverted,
  };
}

export function financeCategoriesView(state: FinanceState): CategoriesView {
  const home = state.settings.homeCurrency;
  const items = categoryBreakdown(inPeriod(state, 'month'), state.categories, home);
  const uncategorised = items.find(slice => slice.category.id === 'uncat');
  return { items, homeCurrency: home, uncategorised: { count: uncategorised?.count ?? 0, totalMinor: uncategorised?.totalMinor ?? 0 } };
}

function optionalText(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

/** As on the server: a field the draft leaves out keeps its value, and an empty one clears it. */
function editedText(draftValue: string | undefined, current: string | undefined): string | undefined {
  return draftValue === undefined ? current : optionalText(draftValue);
}

function buildExpense(state: FinanceState, id: string, draft: ExpenseDraft, syncState: ExpenseDetail['syncState']): ExpenseDetail {
  const amountMinor = parseAmountToMinor(draft.amountText, draft.currency) ?? 0;
  const loggedAt = new Date().toISOString();
  return {
    id,
    amountMinor,
    amountText: draft.amountText,
    currency: draft.currency,
    fxRate: null,
    homeAmountMinor: convertToHomeMinor(amountMinor, draft.currency, null, state.settings.homeCurrency),
    categoryId: draft.categoryId,
    merchant: optionalText(draft.merchant),
    note: optionalText(draft.note),
    occurredOnDate: draft.occurredOnDate,
    loggedAt,
    source: draft.source ?? 'manual',
    syncState,
    receiptRef: draft.receiptRef,
    audit: [
      { id: `${id}-local-created`, action: 'created', changes: [], at: loggedAt },
      ...(draft.receiptRef ? [{ id: `${id}-local-receipt`, action: 'receipt_confirmed' as const, changes: [], at: loggedAt }] : []),
    ],
  };
}

function createExpense(state: FinanceState, draft: ExpenseDraft, syncState: ExpenseDetail['syncState']): FinanceCommandResult {
  const expense = buildExpense(state, draft.id ?? nextExpenseId(), draft, syncState);
  state.expenses = [expense, ...state.expenses];
  state.monthlyExpenseCount += 1;
  return { id: expense.id, message: 'Expense saved.', advisory: deriveCapAdvisory('expenses', state.monthlyExpenseCount) };
}

/** Mirrors the server's `expense.update`: currency, source, receipt and links never change on an edit, and only the owner-visible fields that moved are recorded. */
function updateExpense(state: FinanceState, id: string, draft: ExpenseDraft, syncState: ExpenseDetail['syncState']): FinanceCommandResult {
  state.expenses = state.expenses.map(expense => {
    if (expense.id !== id) return expense;
    const rebuilt = buildExpense(state, id, { ...draft, currency: expense.currency }, syncState);
    const fxRate = expense.fxRate;
    const updated: ExpenseDetail = {
      ...expense,
      amountMinor: rebuilt.amountMinor,
      amountText: rebuilt.amountText,
      homeAmountMinor: convertToHomeMinor(rebuilt.amountMinor, expense.currency, fxRate, state.settings.homeCurrency),
      categoryId: rebuilt.categoryId,
      merchant: editedText(draft.merchant, expense.merchant),
      note: editedText(draft.note, expense.note),
      occurredOnDate: rebuilt.occurredOnDate,
      syncState,
    };
    const changes = expenseChanges(expense, updated);
    if (changes.length === 0) return updated;
    return { ...updated, audit: [...expense.audit, { id: `${id}-local-${rebuilt.loggedAt}`, action: 'updated', changes, at: rebuilt.loggedAt }] };
  });
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
function confirmCycle(state: FinanceState, id: string, billingDate: string, syncState: ExpenseDetail['syncState']): FinanceCommandResult {
  const target = state.subscriptions.find(item => item.id === id);
  if (!target) return { id, message: 'That subscription is no longer here.' };

  const existing = state.expenses.find(expense => expense.linkedSubscriptionId === id && expense.occurredOnDate === billingDate);
  if (existing) return { id: existing.id, message: 'Already confirmed for this cycle.' };

  const expense = buildExpense(
    state,
    nextExpenseId(),
    {
      amountText: target.amountText,
      currency: target.currency,
      categoryId: 'subs',
      occurredOnDate: billingDate,
      note: target.name,
    },
    syncState,
  );
  state.expenses = [{ ...expense, linkedSubscriptionId: id }, ...state.expenses];
  state.subscriptions = state.subscriptions.map(item => (item.id === id ? { ...item, lastConfirmedDate: billingDate } : item));
  return { id: expense.id, message: `${target.name} confirmed for ${billingDate}.` };
}

/** The optimistic apply, shared by the fixtures and by the sync layer's replay of what is still queued. */
export function applyFinanceCommand(state: FinanceState, command: FinanceCommand, syncState: ExpenseDetail['syncState'] = 'synced'): FinanceCommandResult {
  switch (command.type) {
    case 'expense.create':
      return createExpense(state, command.draft, syncState);
    case 'expense.update':
      return updateExpense(state, command.id, command.draft, syncState);
    case 'expense.delete':
      state.expenses = state.expenses.filter(expense => expense.id !== command.id);
      return { id: command.id, message: 'Expense deleted.' };
    case 'subscription.create':
      return createSubscription(state, command.draft);
    case 'subscription.setActive':
      state.subscriptions = state.subscriptions.map(item => (item.id === command.id ? { ...item, active: command.active } : item));
      return { id: command.id, message: command.active ? 'Subscription resumed.' : 'Subscription paused.' };
    case 'subscription.confirmCycle':
      return confirmCycle(state, command.id, command.billingDate, syncState);
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

  private current(): FinanceState {
    return { ...this.state, today: today() };
  }

  async summary(): Promise<FinanceSummary> {
    return financeSummary(this.current());
  }

  async expenses(query: ExpenseQuery): Promise<ExpensePage> {
    return financeExpensePage(this.current(), query);
  }

  async expense(id: string): Promise<ExpenseView> {
    return financeExpenseView(this.current(), id);
  }

  async subscriptions(): Promise<SubscriptionsView> {
    return financeSubscriptionsView(this.current());
  }

  async categories(): Promise<CategoriesView> {
    return financeCategoriesView(this.current());
  }

  async receiptScanQuota(): Promise<ReceiptScanQuota> {
    return { cap: 5, used: 1, resetAt: `${shiftDays(1)}T00:00:00` };
  }

  async uploadReceipt(file: File, progress: ReceiptUploadProgress): Promise<string> {
    progress.onProgress(100);
    return `fixture/${file.name}`;
  }

  confirmReceipt(): Promise<void> {
    return Promise.resolve();
  }

  async receiptLink(): Promise<ReceiptLink> {
    return { url: '/icons/icon.svg', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
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
