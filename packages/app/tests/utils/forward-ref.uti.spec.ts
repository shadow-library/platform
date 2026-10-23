import { describe, expect, it } from 'bun:test';

import { forwardRef } from '@shadow-library/app';

describe('forwardRef', () => {
  it('should return object with forwardRef property', () => {
    const fn = () => ({});
    const referenceFn = forwardRef(() => fn);
    expect(referenceFn.forwardRef()).toBe(fn);
  });
});
