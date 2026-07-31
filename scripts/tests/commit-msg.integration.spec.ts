/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { commitMsg } from '@lib/commit-msg';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('commitMsg (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  const run = (files: Record<string, string>) => {
    fixtureDir = createFixtureDir('shadow-commit-');
    writeFixtureFiles(fixtureDir, files);
    return commitMsg({ cwd: fixtureDir, file: path.join(fixtureDir, 'msg.txt') });
  };

  it('should accept a conventional commit message', async () => {
    await expect(run({ 'msg.txt': 'feat(api): add an endpoint\n' })).resolves.toBe(0);
  });

  it('should reject a non-conventional message', async () => {
    await expect(run({ 'msg.txt': 'just did some stuff\n' })).resolves.toBe(1);
  });

  it('should ignore git comment lines and the verbose diff below the scissors line', async () => {
    const msg = 'fix: correct a bug\n\n# Please enter the commit message for your changes.\n# ------------------------ >8 ------------------------\ndiff --git a/x b/x\n';
    await expect(run({ 'msg.txt': msg })).resolves.toBe(0);
  });

  it('should honor a verify.commit override that drops the base config', async () => {
    await expect(
      run({
        '.shadowrc.json': JSON.stringify({ verify: { commit: { extends: [] } } }),
        'msg.txt': 'not conventional at all\n',
      }),
    ).resolves.toBe(0);
  });

  it('should honor a verify.commit rule override', async () => {
    // a 10-char header passes by default but fails when header-max-length is tightened to 5
    await expect(
      run({
        '.shadowrc.json': JSON.stringify({ verify: { commit: { rules: { 'header-max-length': [2, 'always', 5] } } } }),
        'msg.txt': 'feat: a longer header\n',
      }),
    ).resolves.toBe(1);
  });

  it('should throw a usage error when no file is given', async () => {
    fixtureDir = createFixtureDir('shadow-commit-nofile-');
    await expect(commitMsg({ cwd: fixtureDir, file: '' })).rejects.toThrow(/Usage/);
  });
});
