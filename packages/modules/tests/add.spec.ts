/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { add } from '@lib/index';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Addition', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
