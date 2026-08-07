import { describe, expect, it } from 'bun:test';

import { CUSTOM_DATA_TRANSFORMERS } from '@server/common/data-transformers';

const toIsoDate = CUSTOM_DATA_TRANSFORMERS['date:iso'];

describe('date:iso', () => {
  it('should render a YYYYMMDD number as an ISO calendar date', () => {
    expect(toIsoDate(2024_12_27)).toBe('2024-12-27');
  });

  it('should zero-pad single-digit months and days', () => {
    expect(toIsoDate(2025_01_01)).toBe('2025-01-01');
    expect(toIsoDate(2025_03_07)).toBe('2025-03-07');
  });

  /**
   * The output feeds `Date` in the consuming web app, which reads an unrecognised `DD-MM-YYYY` as either
   * an invalid date or — whenever the day is =< 12 — as US `MM-DD-YYYY`. Both failures are silent, so
   * this asserts day and month cannot transpose for the pair that would collide under that reading.
   */
  it('should keep the day and the month distinguishable', () => {
    expect(toIsoDate(2025_03_07)).not.toBe(toIsoDate(2025_07_03));
    expect(new Date(toIsoDate(2025_03_07)).getUTCMonth()).toBe(2);
    expect(new Date(toIsoDate(2025_03_07)).getUTCDate()).toBe(7);
  });
});
