/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { run, stripGitEnv } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('utils/process', () => {
  describe('stripGitEnv', () => {
    it('should remove every GIT_* key', () => {
      const result = stripGitEnv({ GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/.git/index', PATH: '/usr/bin' });
      expect(result).toStrictEqual({ PATH: '/usr/bin' });
    });

    it('should leave a git-free env untouched', () => {
      const env = { PATH: '/usr/bin', HOME: '/home/x' };
      expect(stripGitEnv(env)).toStrictEqual(env);
    });
  });

  describe('run', () => {
    it('should not let an inherited GIT_DIR redirect a git command away from cwd', () => {
      // Simulates running inside a git hook, which sets GIT_DIR for the invoking repo — a nested git
      // command spawned by this package must still target the directory it was actually asked to run in.
      const result = run('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: process.cwd(),
        env: { ...process.env, GIT_DIR: '/nonexistent/should-be-stripped/.git' },
        stream: false,
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('true');
    });
  });
});
