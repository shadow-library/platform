/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { assertValidWorkloadBinding, isWorkloadPattern, matchesWorkloadBinding } from '@server/modules/auth/oauth';

/**
 * Declaring the constants
 */
const SERVER = 'system:serviceaccount:novel-forge:novel-forge-server';
const WEB = 'system:serviceaccount:novel-forge:novel-forge-web';

describe('workload-subject matcher', () => {
  describe('assertValidWorkloadBinding', () => {
    it('should accept an exact subject and a namespace-scoped pattern', () => {
      expect(() => assertValidWorkloadBinding(SERVER)).not.toThrow();
      expect(() => assertValidWorkloadBinding('system:serviceaccount:novel-forge:*')).not.toThrow();
      expect(() => assertValidWorkloadBinding('system:serviceaccount:novel-forge:novel-forge-*')).not.toThrow();
    });

    it('should reject a cluster-wide namespace wildcard', () => {
      expect(() => assertValidWorkloadBinding('system:serviceaccount:*:*')).toThrow();
      expect(() => assertValidWorkloadBinding('system:serviceaccount:*:novel-forge-server')).toThrow();
    });

    it('should reject a malformed subject', () => {
      expect(() => assertValidWorkloadBinding('novel-forge:novel-forge-server')).toThrow();
      expect(() => assertValidWorkloadBinding('system:serviceaccount:novel-forge')).toThrow();
      expect(() => assertValidWorkloadBinding('system:serviceaccount:novel-forge:name:extra')).toThrow();
    });
  });

  describe('isWorkloadPattern', () => {
    it('should classify by the presence of a wildcard', () => {
      expect(isWorkloadPattern(SERVER)).toBe(false);
      expect(isWorkloadPattern('system:serviceaccount:novel-forge:*')).toBe(true);
    });
  });

  describe('matchesWorkloadBinding', () => {
    it('should match an exact binding only by equality', () => {
      expect(matchesWorkloadBinding(SERVER, SERVER)).toBe(true);
      expect(matchesWorkloadBinding(SERVER, WEB)).toBe(false);
    });

    it('should match any name in the namespace for a namespace wildcard', () => {
      const pattern = 'system:serviceaccount:novel-forge:*';
      expect(matchesWorkloadBinding(pattern, SERVER)).toBe(true);
      expect(matchesWorkloadBinding(pattern, WEB)).toBe(true);
      expect(matchesWorkloadBinding(pattern, 'system:serviceaccount:pulse:pulse-server')).toBe(false);
    });

    it('should match a name prefix within the namespace', () => {
      const pattern = 'system:serviceaccount:novel-forge:novel-forge-*';
      expect(matchesWorkloadBinding(pattern, SERVER)).toBe(true);
      expect(matchesWorkloadBinding(pattern, WEB)).toBe(true);
      expect(matchesWorkloadBinding(pattern, 'system:serviceaccount:novel-forge:worker')).toBe(false);
    });

    it('should anchor the name so a prefix does not match a longer look-alike', () => {
      expect(matchesWorkloadBinding('system:serviceaccount:novel-forge:api', 'system:serviceaccount:novel-forge:api-evil')).toBe(false);
    });

    it('should never let a wildcard span the namespace separator', () => {
      expect(matchesWorkloadBinding('system:serviceaccount:novel-forge:*', 'system:serviceaccount:novel-forge-evil:server')).toBe(false);
    });
  });
});
