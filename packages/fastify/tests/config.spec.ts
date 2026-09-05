/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { parseTrustProxy } from '@lib/config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('parseTrustProxy', () => {
  it('should parse a hop count into a number', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('3')).toBe(3);
  });

  it('should parse a comma-separated CIDR list into a trimmed string array', () => {
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toStrictEqual(['10.0.0.0/8', '127.0.0.1']);
  });

  it('should preserve the legacy booleans for backward compatibility', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });
});
