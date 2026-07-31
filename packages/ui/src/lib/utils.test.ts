/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { getInitials, toPositiveInt } from './utils';

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

describe('toPositiveInt', () => {
  it('parses a positive integer string', () => {
    expect(toPositiveInt('25')).toBe(25);
  });

  it('floors a fractional value', () => {
    expect(toPositiveInt('25.9')).toBe(25);
  });

  it('returns null for null, empty, non-numeric, or non-positive input', () => {
    expect(toPositiveInt(null)).toBeNull();
    expect(toPositiveInt('')).toBeNull();
    expect(toPositiveInt('abc')).toBeNull();
    expect(toPositiveInt('-3')).toBeNull();
    expect(toPositiveInt('0')).toBeNull();
  });

  it('accepts zero only when allowZero is set', () => {
    expect(toPositiveInt('0', true)).toBe(0);
  });
});
