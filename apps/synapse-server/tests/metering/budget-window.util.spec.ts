import { describe, expect, it } from 'bun:test';

import { appCounterKey, windowEnd, windowStart } from '@modules/metering/budget-window.util';

const NOW = new Date('2026-10-17T13:47:12.345Z');

describe('windowStart', () => {
  it('should truncate an hourly window to the hour', () => {
    expect(windowStart('1h', NOW).toISOString()).toBe('2026-10-17T13:00:00.000Z');
  });

  it('should truncate a daily window to the UTC day', () => {
    expect(windowStart('1d', NOW).toISOString()).toBe('2026-10-17T00:00:00.000Z');
  });

  it('should start a 30-day window at the last multiple of 30 days since the epoch', () => {
    const start = windowStart('30d', NOW).getTime();
    expect(start % (30 * 86_400_000)).toBe(0);
    expect(NOW.getTime() - start).toBeLessThan(30 * 86_400_000);
    expect(windowStart('30d', new Date(start + 29 * 86_400_000)).getTime()).toBe(start);
  });
});

describe('windowEnd', () => {
  it('should end each window one window size after its start', () => {
    expect(windowEnd('1h', NOW).toISOString()).toBe('2026-10-17T14:00:00.000Z');
    expect(windowEnd('1d', NOW).toISOString()).toBe('2026-10-18T00:00:00.000Z');
    expect(windowEnd('30d', NOW).getTime() - windowStart('30d', NOW).getTime()).toBe(30 * 86_400_000);
  });

  it('should start a new window exactly at the previous end', () => {
    const end = windowEnd('1h', NOW);
    expect(windowStart('1h', end)).toEqual(end);
    expect(windowStart('1h', new Date(end.getTime() - 1)).toISOString()).toBe('2026-10-17T13:00:00.000Z');
  });
});

describe('appCounterKey', () => {
  it('should key a per-app counter by the app as its own subject', () => {
    expect(appCounterKey('memoir', '1d', NOW)).toEqual({ app: 'memoir', subjectType: 'app', subjectId: 'memoir', window: '1d', windowStart: new Date('2026-10-17T00:00:00.000Z') });
  });
});
