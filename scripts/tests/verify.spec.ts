/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { isRecursiveVerifyCall } from '@lib/verify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('verify', () => {
  describe('isRecursiveVerifyCall', () => {
    it('should detect a direct invocation', () => {
      expect(isRecursiveVerifyCall('shadow-scripts verify')).toBe(true);
    });

    it('should detect a bunx/npx-prefixed invocation', () => {
      expect(isRecursiveVerifyCall('bunx shadow-scripts verify')).toBe(true);
      expect(isRecursiveVerifyCall('npx shadow-scripts verify')).toBe(true);
    });

    it('should not flag unrelated commands', () => {
      expect(isRecursiveVerifyCall('bun run scripts/lint.ts')).toBe(false);
      expect(isRecursiveVerifyCall('shadow-scripts build-lib')).toBe(false);
      expect(isRecursiveVerifyCall('eslint src')).toBe(false);
    });

    it('should not flag a command that merely mentions "verify" elsewhere', () => {
      expect(isRecursiveVerifyCall('bun run scripts/verify-schema.ts')).toBe(false);
    });
  });
});
