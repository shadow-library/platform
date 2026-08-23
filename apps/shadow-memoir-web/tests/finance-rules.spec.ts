import { describe, expect, it } from 'vitest';

import { convertToHomeMinor, deriveDueState, formatMinor, monthlyEquivalentMinor, parseAmountToMinor, type Subscription, type SubscriptionFrequency } from '@/lib/data';

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
