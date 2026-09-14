import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_CATEGORIES,
  convertToHomeMinor,
  deriveDueState,
  type ExpenseDetail,
  financeExpensePage,
  type FinanceSettings,
  type FinanceState,
  financeSubscriptionsView,
  financeSummary,
  formatMinor,
  monthlyEquivalentMinor,
  parseAmountToMinor,
  type Subscription,
  type SubscriptionFrequency,
} from '@/lib/data';

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Spotify',
    amountMinor: 1099,
    amountText: '10.99',
    currency: 'EUR',
    frequency: 'monthly',
    billingDay: 24,
    nextDueDate: '2026-08-24',
    lastConfirmedDate: '2026-07-24',
    categoryId: 'music',
    reminderEnabled: true,
    reminderLead: '3-day',
    monthlyEquivalentMinor: 1099,
    active: true,
    createdAt: '2023-03-01',
    ...overrides,
  };
}

describe('parseAmountToMinor', () => {
  it('should read a plain decimal amount into minor units', () => {
    expect(parseAmountToMinor('18.40', 'EUR')).toBe(1840);
  });

  it('should treat a comma as the decimal separator when it is the only one', () => {
    expect(parseAmountToMinor('18,40', 'EUR')).toBe(1840);
  });

  it('should read a grouped amount with both separators', () => {
    expect(parseAmountToMinor('1,284.60', 'EUR')).toBe(128460);
    expect(parseAmountToMinor('1.284,60', 'EUR')).toBe(128460);
  });

  it('should treat a lone separator followed by three digits as grouping', () => {
    expect(parseAmountToMinor('1.234', 'EUR')).toBe(123400);
  });

  it('should ignore currency symbols and spaces', () => {
    expect(parseAmountToMinor('€ 214.00', 'NOK')).toBe(21400);
  });

  it('should respect a zero-exponent currency', () => {
    expect(parseAmountToMinor('1200', 'JPY')).toBe(1200);
  });

  it('should reject text with no digits and negative amounts', () => {
    expect(parseAmountToMinor('', 'EUR')).toBeNull();
    expect(parseAmountToMinor('abc', 'EUR')).toBeNull();
    expect(parseAmountToMinor('-5.00', 'EUR')).toBeNull();
  });
});

describe('formatMinor', () => {
  it('should render minor units in the currency of the entry', () => {
    expect(formatMinor(1840, 'EUR')).toBe('€18.40');
    expect(formatMinor(1200, 'JPY')).toBe('¥1,200');
  });
});

describe('convertToHomeMinor', () => {
  it('should convert at the locked rate across currencies', () => {
    expect(convertToHomeMinor(21400, 'NOK', 0.086, 'EUR')).toBe(1840);
  });

  it('should pass the amount through when the entry is already in the home currency', () => {
    expect(convertToHomeMinor(1840, 'EUR', null, 'EUR')).toBe(1840);
  });

  it('should return null rather than zero when the rate could not be fetched', () => {
    expect(convertToHomeMinor(21400, 'NOK', null, 'EUR')).toBeNull();
  });
});

describe('monthlyEquivalentMinor', () => {
  const cases: [SubscriptionFrequency, number, number][] = [
    ['weekly', 1000, 4333],
    ['monthly', 1099, 1099],
    ['quarterly', 3000, 1000],
    ['yearly', 16300, 1358],
  ];

  it.each(cases)('should amortise a %s charge', (frequency, amountMinor, expected) => {
    expect(monthlyEquivalentMinor(amountMinor, frequency)).toBe(expected);
  });

  it('should amortise a custom interval by days', () => {
    expect(monthlyEquivalentMinor(1000, 'custom', 10)).toBe(3042);
  });
});

describe('deriveDueState', () => {
  it('should report a charge due today', () => {
    expect(deriveDueState(subscription(), '2026-08-24')).toBe('due');
  });

  it('should report a charge inside the reminder lead as upcoming', () => {
    expect(deriveDueState(subscription(), '2026-08-22')).toBe('upcoming');
  });

  it('should stay quiet outside the reminder lead', () => {
    expect(deriveDueState(subscription(), '2026-08-10')).toBe('none');
  });

  it('should report an unconfirmed past charge as overdue', () => {
    expect(deriveDueState(subscription(), '2026-08-27')).toBe('overdue');
  });

  it('should close the cycle once the charge is confirmed, however late', () => {
    expect(deriveDueState(subscription({ lastConfirmedDate: '2026-08-24' }), '2026-09-04')).toBe('none');
  });

  it('should say nothing about a paused subscription', () => {
    expect(deriveDueState(subscription({ active: false }), '2026-08-27')).toBe('none');
  });
});

const SETTINGS: FinanceSettings = { homeCurrency: 'EUR', currencies: ['EUR'], weekStartsOn: 1, monthlyBudgetMinor: null };

function expense(id: string, occurredOnDate: string, amountMinor: number, overrides: Partial<ExpenseDetail> = {}): ExpenseDetail {
  return {
    id,
    amountMinor,
    amountText: (amountMinor / 100).toFixed(2),
    currency: 'EUR',
    fxRate: null,
    homeAmountMinor: null,
    categoryId: 'food',
    note: id,
    occurredOnDate,
    loggedAt: `${occurredOnDate}T12:00:00Z`,
    source: 'manual',
    syncState: 'synced',
    audit: [],
    ...overrides,
  };
}

function financeState(today: string, expenses: ExpenseDetail[], settings: Partial<FinanceSettings> = {}): FinanceState {
  return { today, settings: { ...SETTINGS, ...settings }, expenses, subscriptions: [], categories: [...BUILT_IN_CATEGORIES], monthlyExpenseCount: expenses.length };
}

describe('financeSummary', () => {
  it('should use the calendar month for this month', () => {
    const state = financeState('2026-09-14', [expense('late-august', '2026-08-31', 1000), expense('first', '2026-09-01', 500), expense('later', '2026-09-20', 250)]);

    const { month } = financeSummary(state).ranges;
    expect(month.spentMinor).toBe(750);
    expect(financeExpensePage(state, { range: 'month' }).items.map(item => item.id)).toEqual(['later', 'first']);
  });

  it('should start Money weeks on Monday whatever the account week start', () => {
    const state = financeState('2026-09-16', [expense('sunday', '2026-09-13', 100), expense('monday', '2026-09-14', 200)]);

    expect(financeSummary(state).ranges.week.spentMinor).toBe(200);
    expect(financeSummary({ ...state, settings: { ...SETTINGS, weekStartsOn: 0 } }).ranges.week.spentMinor).toBe(200);
  });

  it('should report no budget when none is set', () => {
    expect(financeSummary(financeState('2026-09-14', [expense('coffee', '2026-09-02', 420)])).budget).toEqual({ kind: 'unset' });
  });

  it('should compute budget left for the calendar month', () => {
    const state = financeState('2026-09-14', [expense('august', '2026-08-30', 90_000), expense('rent', '2026-09-01', 76_000), expense('fuel', '2026-09-12', 8_000)], {
      monthlyBudgetMinor: 160_000,
    });

    expect(financeSummary(state).budget).toEqual({ kind: 'set', budgetMinor: 160_000, spentMinor: 84_000, leftMinor: 76_000, daysLeft: 17 });
  });

  it('should compute the month delta from previous spend', () => {
    const state = financeState('2026-09-14', [
      expense('last-month-early', '2026-08-10', 1000),
      expense('last-month-late', '2026-08-20', 5000),
      expense('this-month', '2026-09-05', 800),
    ]);

    expect(financeSummary(state).ranges.month.spentDeltaFraction).toBeCloseTo(-0.2);
    expect(financeSummary(financeState('2026-09-14', [expense('this-month', '2026-09-05', 800)])).ranges.month.spentDeltaFraction).toBeNull();
  });

  it('should list only the rates the expenses in range used', () => {
    const state = financeState('2026-09-14', [
      expense('nok', '2026-09-10', 21400, { currency: 'NOK', fxRate: 0.0856, homeAmountMinor: 1832 }),
      expense('usd-last-month', '2026-08-10', 1000, { currency: 'USD', fxRate: 0.9213, homeAmountMinor: 921 }),
    ]);

    const summary = financeSummary(state);
    expect(summary.ranges.month.fxRates).toEqual([{ from: 'NOK', to: 'EUR', rate: 0.0856, date: '2026-09-10' }]);
    expect(summary.ranges.week.fxRates).toEqual([]);
  });

  it('should total a non-euro account in its own currency', () => {
    const state = financeState('2026-09-14', [expense('ramen', '2026-09-03', 1200, { currency: 'JPY', amountText: '1200' })], { homeCurrency: 'JPY', monthlyBudgetMinor: 50_000 });

    const summary = financeSummary(state);
    expect(summary.ranges.month.spentMinor).toBe(1200);
    expect(summary.budget).toMatchObject({ kind: 'set', leftMinor: 48_800 });
    expect(formatMinor(summary.budget.kind === 'set' ? summary.budget.leftMinor : 0, summary.settings.homeCurrency)).toBe('¥48,800');
  });
});

describe('financeExpensePage', () => {
  it('should sort expenses by date', () => {
    const state = financeState('2026-09-14', [
      expense('confirmed-later', '2026-09-11', 999, { loggedAt: '2026-09-14T08:00:00Z' }),
      expense('morning', '2026-09-13', 420, { loggedAt: '2026-09-13T08:00:00Z' }),
      expense('evening', '2026-09-13', 4450, { loggedAt: '2026-09-13T20:00:00Z' }),
    ]);

    expect(financeExpensePage(state, { range: 'month' }).items.map(item => item.id)).toEqual(['evening', 'morning', 'confirmed-later']);
  });
});

describe('financeSubscriptionsView', () => {
  it('should convert foreign subscription totals to the home currency', () => {
    const state: FinanceState = {
      today: '2026-09-14',
      settings: SETTINGS,
      expenses: [expense('nok-rate', '2026-09-10', 21400, { currency: 'NOK', fxRate: 0.086, homeAmountMinor: 1840 })],
      subscriptions: [
        subscription({ id: 'sub-nok', name: 'Aftenposten', amountMinor: 34900, currency: 'NOK', frequency: 'quarterly', monthlyEquivalentMinor: 11633, nextDueDate: '2026-09-25' }),
      ],
      categories: [...BUILT_IN_CATEGORIES],
      monthlyExpenseCount: 1,
    };

    const view = financeSubscriptionsView(state);
    expect(view.monthlyTotalMinor).toBe(1000);
    expect(view.yearlyTotalMinor).toBe(12000);
  });

  it('should leave a home-currency subscription unconverted', () => {
    const state: FinanceState = {
      today: '2026-09-14',
      settings: SETTINGS,
      expenses: [],
      subscriptions: [subscription({ id: 'sub-eur', monthlyEquivalentMinor: 999 })],
      categories: [...BUILT_IN_CATEGORIES],
      monthlyExpenseCount: 0,
    };

    expect(financeSubscriptionsView(state).monthlyTotalMinor).toBe(999);
  });

  it('should flag a foreign subscription without a rate instead of counting it as zero', () => {
    const state: FinanceState = {
      today: '2026-09-14',
      settings: SETTINGS,
      expenses: [],
      subscriptions: [
        subscription({ id: 'sub-eur', name: 'Spotify', currency: 'EUR', monthlyEquivalentMinor: 1099 }),
        subscription({ id: 'sub-nok', name: 'Aftenposten', currency: 'NOK', monthlyEquivalentMinor: 11633 }),
      ],
      categories: [...BUILT_IN_CATEGORIES],
      monthlyExpenseCount: 0,
    };

    const view = financeSubscriptionsView(state);
    expect(view.monthlyTotalMinor).toBe(1099);
    expect(view.yearlyTotalMinor).toBe(1099 * 12);
    expect(view.unconverted).toEqual({ count: 1, currencies: ['NOK'] });

    const summary = financeSummary(state);
    expect(summary.subscriptionsMonthlyMinor).toBe(1099);
    expect(summary.unconvertedSubscriptions).toEqual({ count: 1, currencies: ['NOK'] });
  });
});
