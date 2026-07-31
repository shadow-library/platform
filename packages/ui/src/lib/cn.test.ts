/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { cn } from './cn';

/**
 * Declaring the constants
 */

describe('cn', () => {
  it('joins multiple class values', () => {
    expect(cn('root', 'active')).toBe('root active');
  });

  it('flattens arrays and objects', () => {
    expect(cn(['root', 'sm'], { hidden: false, selected: true })).toBe('root sm selected');
  });

  it('ignores falsy values', () => {
    expect(cn('root', false, null, undefined, 0 && 'hidden')).toBe('root');
  });

  it('preserves order and duplicates as given', () => {
    expect(cn('a', 'b', 'a')).toBe('a b a');
  });

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('');
  });
});
