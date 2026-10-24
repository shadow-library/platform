import { describe, expect, it } from 'bun:test';

import { cyclicChartSlots } from '../src/features/shared/chart-slots';

describe('cyclicChartSlots', () => {
  it('should number keys from 1 in sorted order whatever order they arrive in', () => {
    expect([...cyclicChartSlots(['zeta', 'alpha', 'mid'])]).toEqual([
      ['alpha', 1],
      ['mid', 2],
      ['zeta', 3],
    ]);
  });

  it('should count a repeated key once', () => {
    expect(cyclicChartSlots(['a', 'b', 'a']).get('b')).toBe(2);
  });

  it('should put the null key last so it never moves a named key', () => {
    const slots = cyclicChartSlots([null, 'b', 'a']);
    expect(slots.get('a')).toBe(1);
    expect(slots.get('b')).toBe(2);
    expect(slots.get(null)).toBe(3);
  });

  it('should reuse slots from the ninth key on', () => {
    const slots = cyclicChartSlots('abcdefghij'.split(''));
    expect(slots.get('h')).toBe(8);
    expect(slots.get('i')).toBe(1);
    expect(slots.get('j')).toBe(2);
  });

  it('should be empty for no keys', () => {
    expect(cyclicChartSlots([]).size).toBe(0);
  });
});
