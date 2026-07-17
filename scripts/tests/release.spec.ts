/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { buildChangelog, computeBumpLevel, computeNextVersion, isValidChannel, parseConventionalCommit, parseGitHubRepoSlug } from '@lib/release';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const parse = (messages: string[]) => messages.map(parseConventionalCommit);

describe('release', () => {
  describe('isValidChannel', () => {
    it.each(['stable', 'alpha', 'beta'])('should accept "%s"', channel => {
      expect(isValidChannel(channel)).toBe(true);
    });

    it.each(['', 'STABLE', 'patch', 'rc', 'gamma'])('should reject "%s"', channel => {
      expect(isValidChannel(channel)).toBe(false);
    });
  });

  describe('parseGitHubRepoSlug', () => {
    it('should parse an SSH remote URL', () => {
      expect(parseGitHubRepoSlug('git@github.com:shadow-library/common.git')).toStrictEqual({ owner: 'shadow-library', repo: 'common' });
    });

    it('should parse an HTTPS remote URL', () => {
      expect(parseGitHubRepoSlug('https://github.com/shadow-library/common.git')).toStrictEqual({ owner: 'shadow-library', repo: 'common' });
    });

    it('should parse a remote URL without a trailing .git', () => {
      expect(parseGitHubRepoSlug('https://github.com/shadow-library/common')).toStrictEqual({ owner: 'shadow-library', repo: 'common' });
    });

    it('should throw for a non-GitHub remote', () => {
      expect(() => parseGitHubRepoSlug('git@gitlab.com:group/project.git')).toThrow();
    });
  });

  describe('parseConventionalCommit', () => {
    it('should parse a type, scope, and subject', () => {
      expect(parseConventionalCommit('feat(api): add endpoint')).toMatchObject({ type: 'feat', breaking: false, subject: 'add endpoint' });
    });

    it('should flag a "!" breaking marker', () => {
      expect(parseConventionalCommit('feat!: drop legacy field').breaking).toBe(true);
    });

    it('should flag a BREAKING CHANGE footer', () => {
      expect(parseConventionalCommit('fix: tweak\n\nBREAKING CHANGE: removes an option').breaking).toBe(true);
    });

    it('should fall back to the raw header for a non-conventional message', () => {
      expect(parseConventionalCommit('random commit')).toMatchObject({ type: '', breaking: false, subject: 'random commit' });
    });
  });

  describe('computeBumpLevel', () => {
    it('should return major for any breaking change', () => {
      expect(computeBumpLevel(parse(['fix: a', 'feat!: b']))).toBe('major');
    });

    it('should return minor for a feat with no breaking change', () => {
      expect(computeBumpLevel(parse(['fix: a', 'feat: b', 'chore: c']))).toBe('minor');
    });

    it('should return patch for fixes only', () => {
      expect(computeBumpLevel(parse(['fix: a', 'docs: b']))).toBe('patch');
    });

    it('should default to patch when nothing is releasable', () => {
      expect(computeBumpLevel(parse(['chore: a']))).toBe('patch');
    });
  });

  describe('computeNextVersion', () => {
    it('should apply the level for a stable release from a stable version', () => {
      expect(computeNextVersion('1.2.3', 'minor', 'stable')).toBe('1.3.0');
      expect(computeNextVersion('1.2.3', 'major', 'stable')).toBe('2.0.0');
      expect(computeNextVersion('1.2.3', 'patch', 'stable')).toBe('1.2.4');
    });

    it('should finalize an in-progress prerelease for a stable release, keeping its core', () => {
      expect(computeNextVersion('1.3.0-alpha.2', 'minor', 'stable')).toBe('1.3.0');
    });

    it('should start a prerelease off the applied level from a stable version', () => {
      expect(computeNextVersion('1.2.3', 'minor', 'alpha')).toBe('1.3.0-alpha.0');
    });

    it('should bump the counter for a prerelease of the same channel', () => {
      expect(computeNextVersion('1.3.0-alpha.0', 'minor', 'alpha')).toBe('1.3.0-alpha.1');
    });

    it('should promote across channels in place, keeping the core', () => {
      expect(computeNextVersion('1.3.0-alpha.2', 'minor', 'beta')).toBe('1.3.0-beta.0');
    });
  });

  describe('buildChangelog', () => {
    it('should group features and fixes into sections', () => {
      const changelog = buildChangelog(parse(['feat: new thing', 'fix: old bug', 'chore: noise']));
      expect(changelog).toContain('### Features\n- new thing');
      expect(changelog).toContain('### Bug Fixes\n- old bug');
      expect(changelog).not.toContain('noise');
    });

    it('should fall back to a placeholder when there are no notable changes', () => {
      expect(buildChangelog(parse(['chore: noise']))).toBe('_No notable changes._');
    });
  });
});
