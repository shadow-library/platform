import { describe, expect, it } from 'bun:test';

import { formatDateTime, formatRate, formatSignedUsd, formatUsd } from '../src/features/shared/format';

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

  it('should sign a positive delta', () => {
    expect(formatSignedUsd(1.5)).toBe('+$1.50');
    expect(formatSignedUsd(-1.5)).toBe('-$1.50');
  });
});

describe('formatRate', () => {
  it('should print a percentage, or a dash when there were no calls', () => {
    expect(formatRate(0.125)).toBe('12.5%');
    expect(formatRate(undefined)).toBe('—');
  });
});
