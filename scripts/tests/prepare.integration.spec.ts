/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { prepare } from '@lib/prepare';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('prepare (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should activate husky in a git repo', () => {
    fixtureDir = createFixtureDir('shadow-prepare-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/prep', version: '1.0.0' }) });
    run('git', ['init', '--quiet'], { cwd: fixtureDir, stream: false });

    prepare({ cwd: fixtureDir });

    // husky activation creates the `.husky/_` runtime directory and points git's hooksPath at it.
    expect(fs.existsSync(path.join(fixtureDir, '.husky/_'))).toBe(true);
    const hooksPath = run('git', ['config', 'core.hooksPath'], { cwd: fixtureDir, stream: false });
    expect(hooksPath.stdout.trim()).toBe('.husky/_');
  });

  it('should not throw outside a git repo', () => {
    const dir = createFixtureDir('shadow-prepare-nogit-');
    fixtureDir = dir;
    writeFixtureFiles(dir, { 'package.json': JSON.stringify({ name: '@fixtures/prep', version: '1.0.0' }) });

    expect(() => prepare({ cwd: dir })).not.toThrow();
  });
});
