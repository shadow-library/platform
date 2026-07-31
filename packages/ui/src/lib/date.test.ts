/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { addDays, addMonths, buildMonthMatrix, isSameDay, pad2, parseISODate, startOfMonth, toISODate } from './date';

/**
 * Declaring the constants
 */

describe('pad2', () => {
  it('zero-pads single digits', () => {
    expect(pad2(3)).toBe('03');
  });

  it('leaves two-digit values unchanged', () => {
    expect(pad2(12)).toBe('12');
  });
});

describe('toISODate', () => {
  it('formats a local date as YYYY-MM-DD with a 1-based month', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseISODate', () => {
  it('parses a strict YYYY-MM-DD string to a local date', () => {
    const date = parseISODate('2026-01-05');
    expect(date).not.toBeNull();
    expect(toISODate(date as Date)).toBe('2026-01-05');
  });

  it('trims surrounding whitespace', () => {
    expect(parseISODate(' 2026-01-05 ')).not.toBeNull();
  });

  it('rejects a malformed string', () => {
    expect(parseISODate('05/01/2026')).toBeNull();
    expect(parseISODate('2026-1-5')).toBeNull();
  });

  it('rejects an out-of-range month', () => {
    expect(parseISODate('2026-13-01')).toBeNull();
  });

  it('rejects a day that rolls over into the next month', () => {
    expect(parseISODate('2026-02-30')).toBeNull();
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(toISODate(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
  });

  it('supports negative offsets', () => {
    expect(toISODate(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('does not mutate its argument', () => {
    const original = new Date(2026, 0, 1);
    addDays(original, 5);
    expect(toISODate(original)).toBe('2026-01-01');
  });
});

describe('addMonths', () => {
  it('anchors to the first of the month so month-end days never overflow', () => {
    // Jan 31 + 1 month must land on Feb 1, not the naive "Mar 3" overflow.
    expect(toISODate(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(toISODate(addMonths(new Date(2026, 11, 15), 1))).toBe('2027-01-01');
  });
});

describe('startOfMonth', () => {
  it('returns the first day of the given month', () => {
    expect(toISODate(startOfMonth(new Date(2026, 5, 15)))).toBe('2026-06-01');
  });
});

describe('isSameDay', () => {
  it('is true for the same calendar day regardless of time', () => {
    expect(isSameDay(new Date(2026, 5, 15, 9), new Date(2026, 5, 15, 23))).toBe(true);
  });

  it('is false across different days', () => {
    expect(isSameDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false);
  });
});

describe('buildMonthMatrix', () => {
  it('returns a 6×7 grid', () => {
    const weeks = buildMonthMatrix(2026, 5);
    expect(weeks).toHaveLength(6);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it('pads the leading week with the previous month when the week starts on Sunday', () => {
    // June 1 2026 is a Monday; a Sunday-start grid opens on May 31.
    const weeks = buildMonthMatrix(2026, 5, 0);
    expect(toISODate(weeks[0]?.[0] as Date)).toBe('2026-05-31');
  });

  it('honours a Monday week start', () => {
    const weeks = buildMonthMatrix(2026, 5, 1);
    expect(toISODate(weeks[0]?.[0] as Date)).toBe('2026-06-01');
  });
});
