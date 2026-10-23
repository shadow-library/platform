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

  it('should keep the day and the month distinguishable', () => {
    expect(toIsoDate(2025_03_07)).not.toBe(toIsoDate(2025_07_03));
    expect(new Date(toIsoDate(2025_03_07)).getUTCMonth()).toBe(2);
    expect(new Date(toIsoDate(2025_03_07)).getUTCDate()).toBe(7);
  });
});
