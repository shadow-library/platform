/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { getInitials } from './utils';

/**
 * Declaring the constants
 */

describe('getInitials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
  });

  it('caps at two initials for longer names', () => {
    expect(getInitials('Ada Lovelace King')).toBe('AL');
  });

  it('returns a single initial for a single word', () => {
    expect(getInitials('ada')).toBe('A');
  });

  it('collapses surplus whitespace between words', () => {
    expect(getInitials('  jane   doe ')).toBe('JD');
  });

  it('returns an empty string for an empty name', () => {
    expect(getInitials('')).toBe('');
  });
});
