import { describe, expect, it } from 'bun:test';

import { formatDateTime, formatRate, formatSignedUsd, formatUsd, usdFormat } from '../src/features/shared/format';

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
