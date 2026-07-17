/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { forwardRef } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('forwardRef', () => {
  it('should return object with forwardRef property', () => {
    const fn = () => ({});
    const referenceFn = forwardRef(() => fn);
    expect(referenceFn.forwardRef()).toBe(fn);
  });
});
