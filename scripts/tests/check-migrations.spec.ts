/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { resolveMigrationsDir } from '@lib/check-migrations';
import { ShadowError } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('check-migrations', () => {
  describe('resolveMigrationsDir', () => {
    it('should default to the established server convention', () => {
      expect(resolveMigrationsDir('/repo', undefined)).toBe('generated/drizzle');
    });

    it('should accept a relative --dir override', () => {
      expect(resolveMigrationsDir('/repo', 'db/migrations')).toBe('db/migrations');
    });

    it('should reject a --dir that escapes the repository', () => {
      expect(() => resolveMigrationsDir('/repo', '../../etc')).toThrow(ShadowError);
      expect(() => resolveMigrationsDir('/repo', '../sibling')).toThrow(ShadowError);
    });

    it('should accept "." as the whole repo', () => {
      expect(resolveMigrationsDir('/repo', '.')).toBe('.');
    });
  });
});
