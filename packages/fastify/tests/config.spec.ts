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
  it('should fail closed on a numeric hop count, which fastify no longer supports (CVE-2026-16732)', () => {
    expect(parseTrustProxy('1')).toBe(false);
    expect(parseTrustProxy('3')).toBe(false);
  });

  it('should parse a comma-separated CIDR list into a trimmed string array', () => {
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toStrictEqual(['10.0.0.0/8', '127.0.0.1']);
  });

  it('should preserve the legacy booleans for backward compatibility', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
  });
});
