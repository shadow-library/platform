import { describe, expect, it } from 'bun:test';

import { formatDateTime, formatPrice, formatRate, formatRelativeTime, formatSignedUsd, formatUsd, usdFormat } from '../src/features/shared/format';

describe('formatDateTime', () => {
  it('should print in UTC so the server and the browser agree', () => {
    expect(formatDateTime('2026-10-17T23:45:00.000Z')).toBe('Oct 17, 2026 23:45 UTC');
  });

  it('should print a dash for a missing or unparseable value', () => {
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('soon')).toBe('—');
  });
});

describe('formatUsd', () => {
  it('should keep four decimals below a dollar and two above', () => {
    expect(formatUsd(0.00042)).toBe('$0.0004');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(-0.25)).toBe('-$0.2500');
  });

  it('should group thousands and print negative zero as zero', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(-0)).toBe('$0.00');
  });

  it('should sign a non-zero delta and leave zero unsigned', () => {
    expect(formatSignedUsd(1.5)).toBe('+$1.50');
    expect(formatSignedUsd(-1.5)).toBe('-$1.50');
    expect(formatSignedUsd(0.0004)).toBe('+$0.0004');
    expect(formatSignedUsd(0)).toBe('$0.00');
  });
});

describe('usdFormat', () => {
  it('should give a Statistic the same digits formatUsd prints', () => {
    expect(new Intl.NumberFormat('en-US', usdFormat(0.00042)).format(0.00042)).toBe(formatUsd(0.00042));
    expect(new Intl.NumberFormat('en-US', usdFormat(12.5)).format(12.5)).toBe(formatUsd(12.5));
  });
});

describe('formatRate', () => {
  it('should print a percentage, or a dash when there were no calls', () => {
    expect(formatRate(0.125)).toBe('12.5%');
    expect(formatRate(undefined)).toBe('—');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');

  it('should count minutes, hours and days back from now', () => {
    expect(formatRelativeTime('2026-10-24T11:59:30.000Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-10-24T11:15:00.000Z', now)).toBe('45 min ago');
    expect(formatRelativeTime('2026-10-24T10:00:00.000Z', now)).toBe('2h ago');
    expect(formatRelativeTime('2026-10-23T09:00:00.000Z', now)).toBe('yesterday');
    expect(formatRelativeTime('2026-10-20T12:00:00.000Z', now)).toBe('4 days ago');
  });

  it('should fall back to the date past a month, and read a future instant as just now', () => {
    expect(formatRelativeTime('2026-08-01T12:00:00.000Z', now)).toBe('Aug 01, 2026');
    expect(formatRelativeTime('2026-10-24T12:05:00.000Z', now)).toBe('just now');
    expect(formatRelativeTime('later', now)).toBe('—');
  });
});

describe('formatPrice', () => {
  it('should show cents, and up to two more decimals only when the price has them', () => {
    expect([formatPrice(15), formatPrice(0.15), formatPrice(0.155), formatPrice(0.00042)]).toEqual(['$15.00', '$0.15', '$0.155', '$0.0004']);
  });

  it('should not share a cached formatter with a fixed-precision amount', () => {
    expect(formatUsd(0.5)).toBe('$0.5000');
    expect(formatPrice(0.5)).toBe('$0.50');
  });
});
