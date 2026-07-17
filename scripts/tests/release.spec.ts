/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import {
  applySemverPolicy,
  buildChangelog,
  bumpVersion,
  computeBumpLevel,
  computeNextVersion,
  isReleaseChannel,
  isValidLevel,
  isValidRelease,
  parseConventionalCommit,
  parseGitHubRepoSlug,
} from '@lib/release';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const parse = (messages: string[]) => messages.map(parseConventionalCommit);

describe('release', () => {
  describe('isValidLevel', () => {
    it.each(['major', 'minor', 'patch'])('should accept "%s"', level => {
      expect(isValidLevel(level)).toBe(true);
    });

    it.each(['', 'MAJOR', 'stable', 'alpha', 'prerelease'])('should reject "%s"', level => {
      expect(isValidLevel(level)).toBe(false);
    });
  });

  describe('isReleaseChannel / isValidRelease', () => {
    it.each(['alpha', 'beta'])('should accept the prerelease channel "%s"', channel => {
      expect(isReleaseChannel(channel)).toBe(true);
      expect(isValidRelease(channel)).toBe(true);
    });

    it('should treat a level as a valid release but not a channel', () => {
      expect(isReleaseChannel('minor')).toBe(false);
      expect(isValidRelease('minor')).toBe(true);
    });

    it.each(['stable', 'rc', ''])('should reject "%s" as a release', value => {
      expect(isValidRelease(value)).toBe(false);
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

  describe('applySemverPolicy', () => {
    it('should leave the level unchanged at 1.0.0 and above', () => {
      expect(applySemverPolicy('major', '1.2.3')).toBe('major');
      expect(applySemverPolicy('minor', '1.2.3')).toBe('minor');
      expect(applySemverPolicy('patch', '1.2.3')).toBe('patch');
    });

    it('should demote every level one step while the major is 0', () => {
      expect(applySemverPolicy('major', '0.1.0')).toBe('minor');
      expect(applySemverPolicy('minor', '0.1.0')).toBe('patch');
      expect(applySemverPolicy('patch', '0.1.0')).toBe('patch');
    });

    it('should treat a 0.x prerelease as pre-1.0 too', () => {
      expect(applySemverPolicy('major', '0.2.0-alpha.0')).toBe('minor');
    });

    it('should mean a 0.x breaking change only requires a minor release', () => {
      // a breaking change in 0.x resolves to a "minor" requirement, so `release minor` is allowed
      expect(applySemverPolicy(computeBumpLevel(parse(['feat!: break'])), '0.1.0')).toBe('minor');
    });
  });

  describe('bumpVersion', () => {
    it('should apply each level to a stable version', () => {
      expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
      expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
      expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    });

    it('should bump a 0.x version by the chosen level', () => {
      expect(bumpVersion('0.1.1', 'minor')).toBe('0.2.0');
      expect(bumpVersion('0.1.1', 'patch')).toBe('0.1.2');
    });

    it('should drop a prerelease tag when bumping', () => {
      expect(bumpVersion('1.3.0-alpha.2', 'patch')).toBe('1.3.1');
    });
  });

  describe('computeNextVersion (prerelease channels)', () => {
    it('should start a prerelease off the applied level from a stable version', () => {
      expect(computeNextVersion('1.2.3', 'minor', 'alpha')).toBe('1.3.0-alpha.0');
    });

    it('should bump the counter for a prerelease of the same channel', () => {
      expect(computeNextVersion('1.3.0-alpha.0', 'minor', 'alpha')).toBe('1.3.0-alpha.1');
    });

    it('should switch channels in place, keeping the core', () => {
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
