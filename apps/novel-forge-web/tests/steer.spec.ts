import { describe, expect, it } from 'bun:test';

import { toggleNudge } from '../src/features/shared/steer';

describe('toggleNudge', () => {
  it('should add a nudge that is not picked and remove one that is', () => {
    expect(toggleNudge([], 'Fewer chips')).toEqual(['Fewer chips']);
    expect(toggleNudge(['Fewer chips'], 'Fewer chips')).toEqual([]);
  });
});
