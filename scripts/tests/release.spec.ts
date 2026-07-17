/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { isValidBump, parseGitHubRepoSlug, shouldBackSync } from '@lib/release';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('release', () => {
  describe('isValidBump', () => {
    it.each(['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor'])('should accept "%s"', bump => {
      expect(isValidBump(bump)).toBe(true);
    });

    it.each(['', 'PATCH', 'minorx', 'beta', 'v1.0.0'])('should reject "%s"', bump => {
      expect(isValidBump(bump)).toBe(false);
    });
  });

  describe('shouldBackSync', () => {
    it('should back-sync when git.push is explicitly false', () => {
      expect(shouldBackSync({ git: { push: false } })).toBe(true);
    });

    it('should not back-sync when git.push is true', () => {
      expect(shouldBackSync({ git: { push: true } })).toBe(false);
    });

    it('should not back-sync when git.push is unset (release-it defaults to pushing)', () => {
      expect(shouldBackSync({})).toBe(false);
      expect(shouldBackSync({ git: {} })).toBe(false);
    });
  });

  describe('parseGitHubRepoSlug', () => {
    it('should parse an SSH remote URL', () => {
      expect(parseGitHubRepoSlug('git@github.com:shadow-library/common.git')).toBe('shadow-library/common');
    });

    it('should parse an HTTPS remote URL', () => {
      expect(parseGitHubRepoSlug('https://github.com/shadow-library/common.git')).toBe('shadow-library/common');
    });

    it('should parse a remote URL without a trailing .git', () => {
      expect(parseGitHubRepoSlug('https://github.com/shadow-library/common')).toBe('shadow-library/common');
    });

    it('should throw for a non-GitHub remote', () => {
      expect(() => parseGitHubRepoSlug('git@gitlab.com:group/project.git')).toThrow();
    });
  });
});
