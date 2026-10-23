import { describe, expect, it } from 'bun:test';

import { customExpiry, expiryCeiling, MAX_KEY_LIFETIME_DAYS, presetExpiry } from '../src/lib/bot-key-expiry';

const DAY_MS = 24 * 60 * 60 * 1000;
const MARGIN_MS = 60_000;
const NOW = new Date(2026, 5, 15, 10, 30, 0, 0);

describe('expiryCeiling', () => {
  it('should sit one safety margin short of 365 days from now', () => {
    expect(MAX_KEY_LIFETIME_DAYS).toBe(365);
    expect(expiryCeiling(NOW)).toBe(NOW.getTime() + 365 * DAY_MS - MARGIN_MS);
  });
});

describe('presetExpiry', () => {
  it.each([30, 90, 180])('should add exactly %d days when under the ceiling', days => {
    expect(presetExpiry(days, NOW).getTime()).toBe(NOW.getTime() + days * DAY_MS);
  });

  it('should cap the 365-day preset at the ceiling', () => {
    const expiry = presetExpiry(365, NOW);
    expect(expiry.getTime()).toBe(expiryCeiling(NOW));
    expect(expiry.getTime()).toBeLessThan(NOW.getTime() + 365 * DAY_MS);
  });

  it('should cap any longer duration at the ceiling', () => {
    expect(presetExpiry(10_000, NOW).getTime()).toBe(expiryCeiling(NOW));
  });

  it('should not mutate the injected now', () => {
    const before = NOW.getTime();
    presetExpiry(30, NOW);
    expect(NOW.getTime()).toBe(before);
  });
});

describe('customExpiry', () => {
  it('should resolve to the last millisecond of the chosen local day', () => {
    const expiry = customExpiry(new Date(2026, 6, 4), NOW);
    expect(expiry.getFullYear()).toBe(2026);
    expect(expiry.getMonth()).toBe(6);
    expect(expiry.getDate()).toBe(4);
    expect(expiry.getHours()).toBe(23);
    expect(expiry.getMinutes()).toBe(59);
    expect(expiry.getSeconds()).toBe(59);
    expect(expiry.getMilliseconds()).toBe(999);
  });

  it('should ignore the time of day on the supplied date', () => {
    const expiry = customExpiry(new Date(2026, 6, 4, 18, 45, 12, 5), NOW);
    expect(expiry.getTime()).toBe(new Date(2026, 6, 4, 23, 59, 59, 999).getTime());
  });

  it('should cap the end of day at the ceiling when it falls beyond', () => {
    const last = new Date(NOW.getFullYear() + 2, 0, 1);
    expect(customExpiry(last, NOW).getTime()).toBe(expiryCeiling(NOW));
  });

  it('should cap the 365th day because its end of day exceeds the ceiling', () => {
    const lastAllowed = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + MAX_KEY_LIFETIME_DAYS - 1);
    const endOfDay = new Date(lastAllowed.getFullYear(), lastAllowed.getMonth(), lastAllowed.getDate(), 23, 59, 59, 999).getTime();
    expect(customExpiry(lastAllowed, NOW).getTime()).toBe(Math.min(endOfDay, expiryCeiling(NOW)));
  });

  it('should keep a date inside the window uncapped', () => {
    const near = new Date(2026, 5, 20);
    expect(customExpiry(near, NOW).getTime()).toBe(new Date(2026, 5, 20, 23, 59, 59, 999).getTime());
  });

  it('should resolve to the same local calendar day across a daylight-saving boundary', () => {
    const march = new Date(2026, 2, 29);
    const expiry = customExpiry(march, new Date(2026, 2, 1, 12));
    expect(expiry.getDate()).toBe(29);
    expect(expiry.getHours()).toBe(23);
    expect(expiry.getMilliseconds()).toBe(999);
  });

  it('should treat the cap as an absolute instant independent of the local zone', () => {
    const early = new Date(2026, 0, 1, 0, 0, 0, 0);
    expect(expiryCeiling(early) - early.getTime()).toBe(365 * DAY_MS - MARGIN_MS);
    expect(presetExpiry(365, early).getTime() - early.getTime()).toBe(365 * DAY_MS - MARGIN_MS);
  });
});
