import { describe, expect, it } from 'bun:test';

import { relativeChange } from '../src/features/aliases/alias-impact';

describe('relativeChange', () => {
  it('should express a saving as a negative fraction of the current cost', () => {
    expect(relativeChange(-2.5, 10)).toBe(-0.25);
  });

  it('should express a rise as a positive fraction of the current cost', () => {
    expect(relativeChange(5, 10)).toBe(0.5);
  });

  it('should leave the delta out when the current cost is zero', () => {
    expect(relativeChange(3, 0)).toBeUndefined();
    expect(relativeChange(0, 0)).toBeUndefined();
  });
});
