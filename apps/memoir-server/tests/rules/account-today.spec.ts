import { describe, expect, it } from 'bun:test';

import { accountToday, formatLocalDate } from '@modules/rules';

const NOW = Date.parse('2026-03-10T11:00:00Z');

describe('accountToday', () => {
  it('should read the date in the account zone', () => {
    expect(formatLocalDate(accountToday(NOW, 'Pacific/Kiritimati', '2026-03-10'))).toBe('2026-03-11');
    expect(formatLocalDate(accountToday(NOW, 'America/Los_Angeles', null))).toBe('2026-03-10');
  });

  it('should keep to the open day while a backward zone change leaves the zone behind it', () => {
    expect(formatLocalDate(accountToday(NOW, 'UTC', '2026-03-11'))).toBe('2026-03-11');
  });
});
