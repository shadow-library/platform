import { describe, expect, it } from 'bun:test';

import { advanceDueDate } from '@modules/finance';

describe('advanceDueDate (T-25)', () => {
  it('should advance a weekly subscription by 7 days', () => {
    expect(advanceDueDate({ frequency: 'weekly', billingDay: 1, customIntervalDays: null }, '2026-08-10')).toBe('2026-08-17');
  });

  it('should advance a monthly subscription by one month, clamped to the shorter month end', () => {
    expect(advanceDueDate({ frequency: 'monthly', billingDay: 31, customIntervalDays: null }, '2026-01-31')).toBe('2026-02-28');
  });

  it('should advance a monthly subscription back to the full billing day once months are long enough again', () => {
    const afterFebruary = advanceDueDate({ frequency: 'monthly', billingDay: 31, customIntervalDays: null }, '2026-02-28');
    expect(afterFebruary).toBe('2026-03-31');
  });

  it('should advance a quarterly subscription by three months with clamping', () => {
    expect(advanceDueDate({ frequency: 'quarterly', billingDay: 31, customIntervalDays: null }, '2025-11-30')).toBe('2026-02-28');
  });

  it('should advance a yearly subscription by twelve months, clamping Feb 29 in a non-leap year', () => {
    expect(advanceDueDate({ frequency: 'yearly', billingDay: 29, customIntervalDays: null }, '2024-02-29')).toBe('2025-02-28');
  });

  it('should advance a custom-frequency subscription by its configured interval', () => {
    expect(advanceDueDate({ frequency: 'custom', billingDay: 1, customIntervalDays: 10 }, '2026-08-10')).toBe('2026-08-20');
  });

  it('should fall back to a 30-day interval for a custom frequency with no configured interval', () => {
    expect(advanceDueDate({ frequency: 'custom', billingDay: 1, customIntervalDays: null }, '2026-08-10')).toBe('2026-09-09');
  });
});
