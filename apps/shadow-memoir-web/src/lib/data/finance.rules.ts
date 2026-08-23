import { DEFAULT_LOCALE } from '@shadow-library/ui';

import {
  BUILT_IN_CATEGORIES,
  type CategorySlice,
  CURRENCIES,
  type CurrencyCode,
  type Expense,
  type ExpenseCategory,
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

export function currencyExponent(currency: CurrencyCode): number {
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

export function formatAmountText(amountText: string, currency: CurrencyCode): string {
  return `${CURRENCIES[currency].symbol} ${amountText} ${currency}`;
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

export function upcomingWindowDays(subscription: Pick<Subscription, 'reminderEnabled' | 'reminderLead'>): number {
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
