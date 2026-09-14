import { DEFAULT_LOCALE } from '@shadow-library/ui';

import { formatLocalDate } from '@/lib/format';

import {
  type BudgetStanding,
  BUILT_IN_CATEGORIES,
  type CategorySlice,
  CURRENCIES,
  type CurrencyCode,
  type Expense,
  type ExpenseAuditChange,
  type ExpenseAuditEntry,
  type ExpenseAuditField,
  type ExpenseCategory,
  type FinanceRange,
  type FinanceSettings,
  type FxRateSnapshot,
  type ReminderLead,
  type Subscription,
  type SubscriptionDueState,
  type SubscriptionFrequency,
  UNCATEGORISED,
} from './finance.types';

const DAYS_PER_MONTH = 365 / 12;

const DEFAULT_UPCOMING_WINDOW_DAYS = 7;

const REMINDER_LEAD_DAYS: Record<ReminderLead, number> = {
  'on-day': 0,
  '1-day': 1,
  '2-day': 2,
  '3-day': 3,
  '1-week': 7,
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

function currencyExponent(currency: CurrencyCode): number {
  return CURRENCIES[currency].exponent;
}

/**
 * Reads what the owner typed. The separator rule is the ambiguous part: with both separators present the
 * last one is the decimal point, and a lone separator followed by exactly three digits is grouping
 * (`1.234` is one thousand two hundred and thirty-four in half of Europe, never 1.234).
 */
export function parseAmountToMinor(text: string, currency: CurrencyCode): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned) || cleaned.includes('-')) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const separator = Math.max(lastDot, lastComma);
  const tail = separator === -1 ? '' : cleaned.slice(separator + 1);
  const bothPresent = lastDot !== -1 && lastComma !== -1;
  const repeated = cleaned.split(separator === lastDot ? '.' : ',').length > 2;
  const isDecimal = separator !== -1 && tail.length > 0 && !tail.includes('.') && !tail.includes(',') && (bothPresent || !repeated) && tail.length !== 3;

  const whole = (isDecimal ? cleaned.slice(0, separator) : cleaned).replace(/[.,]/g, '') || '0';
  const fraction = isDecimal ? tail : '';
  if (!/^\d+$/.test(whole)) return null;
  if (fraction && !/^\d+$/.test(fraction)) return null;

  const value = Number(fraction ? `${whole}.${fraction}` : whole);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** currencyExponent(currency));
}

export function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** currencyExponent(currency);
}

export function formatMinor(amountMinor: number, currency: CurrencyCode, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minorToMajor(amountMinor, currency));
}

/**
 * Applies the rate captured when the expense was entered. A null rate is a real state — the entry saved
 * without one and reconciles later — so it converts to null rather than to zero.
 */
export function convertToHomeMinor(amountMinor: number, currency: CurrencyCode, fxRate: number | null, homeCurrency: CurrencyCode): number | null {
  if (currency === homeCurrency) return amountMinor;
  if (fxRate === null) return null;
  const major = minorToMajor(amountMinor, currency) * fxRate;
  return Math.round(major * 10 ** currencyExponent(homeCurrency));
}

export function monthlyEquivalentMinor(amountMinor: number, frequency: SubscriptionFrequency, customIntervalDays?: number): number {
  switch (frequency) {
    case 'weekly':
      return Math.round((amountMinor * 52) / 12);
    case 'monthly':
      return amountMinor;
    case 'quarterly':
      return Math.round(amountMinor / 3);
    case 'yearly':
      return Math.round(amountMinor / 12);
    case 'custom':
      return customIntervalDays && customIntervalDays > 0 ? Math.round((amountMinor * DAYS_PER_MONTH) / customIntervalDays) : amountMinor;
  }
}

export function daysBetween(fromISODate: string, toISODate: string): number {
  const from = Date.parse(`${fromISODate}T00:00:00Z`);
  const to = Date.parse(`${toISODate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function upcomingWindowDays(subscription: Pick<Subscription, 'reminderEnabled' | 'reminderLead'>): number {
  return subscription.reminderEnabled ? REMINDER_LEAD_DAYS[subscription.reminderLead] : DEFAULT_UPCOMING_WINDOW_DAYS;
}

/**
 * Never stored. A cycle already confirmed reads as `none` however far past its date it is, because
 * confirm-on-fire is what closes a cycle — the calendar alone never does.
 */
export function deriveDueState(subscription: Subscription, todayISODate: string): SubscriptionDueState {
  if (!subscription.active) return 'none';
  if (subscription.lastConfirmedDate && subscription.lastConfirmedDate >= subscription.nextDueDate) return 'none';

  const daysUntilDue = daysBetween(todayISODate, subscription.nextDueDate);
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'due';
  return daysUntilDue <= upcomingWindowDays(subscription) ? 'upcoming' : 'none';
}

export const DUE_STATE_LABELS: Record<SubscriptionDueState, string> = {
  none: '',
  upcoming: 'Renews soon',
  due: 'Renews today',
  overdue: 'Waiting to be confirmed',
};

export function homeAmountOf(expense: Expense, homeCurrency: CurrencyCode): number | null {
  return expense.homeAmountMinor ?? convertToHomeMinor(expense.amountMinor, expense.currency, expense.fxRate, homeCurrency);
}

export function categoryById(id: ExpenseCategory['id'], categories: ExpenseCategory[] = BUILT_IN_CATEGORIES): ExpenseCategory {
  return categories.find(category => category.id === id) ?? UNCATEGORISED;
}

export function categoryBreakdown(expenses: Expense[], categories: ExpenseCategory[], homeCurrency: CurrencyCode): CategorySlice[] {
  const totals = new Map<string, { count: number; totalMinor: number }>();
  for (const expense of expenses) {
    const entry = totals.get(expense.categoryId) ?? { count: 0, totalMinor: 0 };
    entry.count += 1;
    entry.totalMinor += homeAmountOf(expense, homeCurrency) ?? 0;
    totals.set(expense.categoryId, entry);
  }

  const slices = categories
    .map(category => ({ category, ...(totals.get(category.id) ?? { count: 0, totalMinor: 0 }), percentOfLargest: 0 }))
    .sort((a, b) => b.totalMinor - a.totalMinor);

  const largest = slices[0]?.totalMinor ?? 0;
  return slices.map(slice => ({ ...slice, percentOfLargest: largest > 0 ? Math.round((slice.totalMinor / largest) * 100) : 0 }));
}

export function sumHomeMinor(expenses: Expense[], homeCurrency: CurrencyCode): number {
  return expenses.reduce((total, expense) => total + (homeAmountOf(expense, homeCurrency) ?? 0), 0);
}

export function expenseTitle(expense: Pick<Expense, 'note' | 'merchant' | 'categoryId'>, categories: ExpenseCategory[] = BUILT_IN_CATEGORIES): string {
  return expense.note || expense.merchant || categoryById(expense.categoryId, categories).name;
}

export function compareExpensesByDate(a: Expense, b: Expense): number {
  if (a.occurredOnDate !== b.occurredOnDate) return a.occurredOnDate < b.occurredOnDate ? 1 : -1;
  if (a.loggedAt === b.loggedAt) return 0;
  return a.loggedAt < b.loggedAt ? 1 : -1;
}

export interface DateSpan {
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

function utcOf(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function shiftISODate(isoDate: string, days: number): string {
  return new Date(utcOf(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function partsOf(today: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = today.split('-').map(Number);
  return { year, month, day };
}

/** Weeks start on Monday, as Planning, Review and the crown count them; the account's week start only shapes the date picker until it applies app-wide. */
export function financePeriod(range: FinanceRange, today: string): DateSpan {
  const { year, month } = partsOf(today);
  if (range === 'year') return { start: isoDate(year, 1, 1), end: isoDate(year, 12, 31) };
  if (range === 'month') return { start: isoDate(year, month, 1), end: isoDate(year, month, daysInMonth(year, month)) };
  const offset = (new Date(utcOf(today)).getUTCDay() + 6) % 7;
  const start = shiftISODate(today, -offset);
  return { start, end: shiftISODate(start, 6) };
}

/** The same stretch of the previous period up to the same point — the 1st to the 14th of last month when today is the 14th. */
export function previousStretch(range: FinanceRange, today: string): DateSpan {
  const { year, month, day } = partsOf(today);
  if (range === 'week') return { start: shiftISODate(financePeriod('week', today).start, -7), end: shiftISODate(today, -7) };
  if (range === 'year') return { start: isoDate(year - 1, 1, 1), end: isoDate(year - 1, month, Math.min(day, daysInMonth(year - 1, month))) };
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return { start: isoDate(previousYear, previousMonth, 1), end: isoDate(previousYear, previousMonth, Math.min(day, daysInMonth(previousYear, previousMonth))) };
}

export function withinSpan(isoDateValue: string, span: DateSpan): boolean {
  return isoDateValue >= span.start && isoDateValue <= span.end;
}

export function spendDelta(currentMinor: number, previousMinor: number): number | null {
  if (previousMinor <= 0) return null;
  return (currentMinor - previousMinor) / previousMinor;
}

export function budgetStanding(expenses: Expense[], settings: FinanceSettings, today: string): BudgetStanding {
  if (settings.monthlyBudgetMinor === null) return { kind: 'unset' };
  const month = financePeriod('month', today);
  const spentMinor = sumHomeMinor(
    expenses.filter(expense => withinSpan(expense.occurredOnDate, month)),
    settings.homeCurrency,
  );
  const { year, month: monthNumber, day } = partsOf(today);
  return {
    kind: 'set',
    budgetMinor: settings.monthlyBudgetMinor,
    spentMinor,
    leftMinor: settings.monthlyBudgetMinor - spentMinor,
    daysLeft: daysInMonth(year, monthNumber) - day + 1,
  };
}

function rateSnapshots(expenses: Expense[], homeCurrency: CurrencyCode): FxRateSnapshot[] {
  return expenses
    .filter(expense => expense.currency !== homeCurrency && expense.fxRate !== null)
    .map(expense => ({ from: expense.currency, to: homeCurrency, rate: expense.fxRate ?? 0, date: expense.occurredOnDate }));
}

export function ratesUsed(expenses: Expense[], homeCurrency: CurrencyCode): FxRateSnapshot[] {
  const unique = new Map<string, FxRateSnapshot>();
  for (const snapshot of rateSnapshots(expenses, homeCurrency)) unique.set(`${snapshot.from}:${snapshot.rate}`, snapshot);
  return [...unique.values()].sort((a, b) => a.from.localeCompare(b.from) || b.date.localeCompare(a.date));
}

export function latestRates(expenses: Expense[], homeCurrency: CurrencyCode): FxRateSnapshot[] {
  const newest = new Map<CurrencyCode, FxRateSnapshot>();
  for (const snapshot of rateSnapshots(expenses, homeCurrency)) {
    const current = newest.get(snapshot.from);
    if (!current || snapshot.date > current.date) newest.set(snapshot.from, snapshot);
  }
  return [...newest.values()].sort((a, b) => a.from.localeCompare(b.from));
}

const AUDIT_FIELD_LABELS: Record<ExpenseAuditField, string> = {
  amountMinor: 'Amount',
  currency: 'Currency',
  occurredOn: 'Date',
  categoryId: 'Category',
  note: 'Note',
  merchant: 'Merchant',
};

function auditValue(field: ExpenseAuditField, value: string, currency: CurrencyCode, categories: ExpenseCategory[]): string {
  switch (field) {
    case 'amountMinor':
      return /^-?\d+$/.test(value) ? formatMinor(Number(value), currency) : value;
    case 'occurredOn':
      return formatLocalDate(value) || value;
    case 'categoryId':
      return categories.find(category => category.id === value)?.name ?? value;
    case 'note':
    case 'merchant':
      return `“${value}”`;
    case 'currency':
      return value;
  }
}

export function describeAuditChange(change: ExpenseAuditChange, currency: CurrencyCode, categories: ExpenseCategory[]): string {
  const label = AUDIT_FIELD_LABELS[change.field];
  if (change.from === null && change.to === null) return `${label} changed`;
  if (change.from === null) return `${label} added: ${auditValue(change.field, change.to ?? '', currency, categories)}`;
  if (change.to === null) return `${label} removed (was ${auditValue(change.field, change.from, currency, categories)})`;
  return `${label} ${auditValue(change.field, change.from, currency, categories)} → ${auditValue(change.field, change.to, currency, categories)}`;
}

export function describeAuditEntry(entry: ExpenseAuditEntry, currency: CurrencyCode, categories: ExpenseCategory[]): string[] {
  switch (entry.action) {
    case 'created':
      return ['Created'];
    case 'receipt_confirmed':
      return ['Receipt attached'];
    case 'deleted':
      return ['Deleted'];
    case 'updated':
      return entry.changes.length > 0 ? entry.changes.map(change => describeAuditChange(change, currency, categories)) : ['Edited'];
  }
}

function auditSequence(id: string): bigint | null {
  return /^\d+$/.test(id) ? BigInt(id) : null;
}

/** Newest first by server time, then by row id; a local entry that has no server id yet sorts above its peers. */
export function sortAuditNewestFirst(entries: ExpenseAuditEntry[]): ExpenseAuditEntry[] {
  return [...entries].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    const left = auditSequence(a.id);
    const right = auditSequence(b.id);
    if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1;
    return left === right ? 0 : left < right ? 1 : -1;
  });
}

function auditText(value: string | undefined): string | null {
  return value ? value : null;
}

export function expenseChanges(before: Expense, after: Expense): ExpenseAuditChange[] {
  const pairs: [ExpenseAuditField, string | null, string | null][] = [
    ['amountMinor', String(before.amountMinor), String(after.amountMinor)],
    ['currency', before.currency, after.currency],
    ['occurredOn', before.occurredOnDate, after.occurredOnDate],
    ['categoryId', before.categoryId, after.categoryId],
    ['note', auditText(before.note), auditText(after.note)],
    ['merchant', auditText(before.merchant), auditText(after.merchant)],
  ];
  return pairs.filter(([, from, to]) => from !== to).map(([field, from, to]) => ({ field, from, to }));
}
