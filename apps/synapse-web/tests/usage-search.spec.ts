import { describe, expect, it } from 'bun:test';

import { parseUsageSearch, rangeProblem, usageParams } from '../src/features/usage/usage-search';

describe('parseUsageSearch', () => {
  it('should group by app when nothing is given', () => {
    expect(parseUsageSearch({})).toEqual({ groupBy: 'app' });
  });

  it('should keep calendar dates and a known grouping', () => {
    expect(parseUsageSearch({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' })).toEqual({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' });
  });

  it('should drop malformed dates and an unknown grouping', () => {
    expect(parseUsageSearch({ from: '2026-13-45', to: 'yesterday', groupBy: 'subject' })).toEqual({ groupBy: 'app' });
  });
});

describe('usageParams', () => {
  it('should send only the bounds that are set', () => {
    expect(usageParams({ groupBy: 'day', from: '2026-09-01' })).toEqual({ groupBy: 'day', from: '2026-09-01' });
  });
});

describe('rangeProblem', () => {
  it('should refuse an empty or inverted range', () => {
    expect(rangeProblem('2026-10-01', '2026-10-01')).not.toBeNull();
    expect(rangeProblem('2026-10-02', '2026-10-01')).not.toBeNull();
  });

  it('should accept an open or ordered range', () => {
    expect(rangeProblem(undefined, '2026-10-01')).toBeNull();
    expect(rangeProblem('2026-09-01', '2026-10-01')).toBeNull();
  });
});
