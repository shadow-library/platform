import { describe, expect, it } from 'bun:test';

import { validationWindows } from '@modules/ai/graphs/novel-validation.graph';

describe('validationWindows', () => {
  it('should cover the finalized chapters in fixed windows of twenty, whatever volumes the novel has', () => {
    expect(validationWindows([1, 2, 3, 45])).toEqual([
      { from: 1, to: 20 },
      { from: 21, to: 40 },
      { from: 41, to: 45 },
    ]);
  });

  it('should start at the first finalized chapter', () => {
    expect(validationWindows([5, 6, 7])).toEqual([{ from: 5, to: 7 }]);
  });

  it('should plan nothing before a chapter is finalized', () => {
    expect(validationWindows([])).toEqual([]);
  });
});
