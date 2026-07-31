/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { init } from '@lib/init';
import { run } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function initGit(dir: string): void {
  run('git', ['init', '--quiet'], { cwd: dir, stream: false });
}

describe('init (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  const read = (name: string) => fs.readFileSync(path.join(fixtureDir!, name), 'utf-8').trim();

  it('should set prepare, wire both hooks, and drop a starter .shadowrc.json', async () => {
    fixtureDir = createFixtureDir('shadow-init-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }) });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(JSON.parse(read('package.json')).scripts.prepare).toBe('shadow prepare');
    expect(read('.husky/pre-commit')).toBe('shadow verify');
    expect(read('.husky/commit-msg')).toBe('shadow commit-msg "$1"');
    expect(fs.existsSync(path.join(fixtureDir, '.shadowrc.json'))).toBe(true);
    // The repo gets a standard .prettierrc.json holding the canonical ruleset, so prettier and verify agree.
    const prettierConfig = JSON.parse(read('.prettierrc.json'));
    expect(prettierConfig).toStrictEqual({ singleQuote: true, trailingComma: 'all', printWidth: 180, arrowParens: 'avoid' });
  });

  it('should migrate a "prepare": "husky" script to "shadow prepare"', async () => {
    fixtureDir = createFixtureDir('shadow-init-prepare-migrate-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0', scripts: { prepare: 'husky' } }) });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(JSON.parse(read('package.json')).scripts.prepare).toBe('shadow prepare');
  });

  it('should leave an existing .prettierrc.json untouched', async () => {
    fixtureDir = createFixtureDir('shadow-init-prettier-custom-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }),
      '.prettierrc.json': '{ "printWidth": 100 }\n',
    });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(JSON.parse(read('.prettierrc.json')).printWidth).toBe(100);
  });

  it('should not drop a .prettierrc.json when the repo already configures prettier another way', async () => {
    fixtureDir = createFixtureDir('shadow-init-prettier-foreign-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }),
      'prettier.config.mjs': 'export default { printWidth: 100 };\n',
    });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(fs.existsSync(path.join(fixtureDir, '.prettierrc.json'))).toBe(false);
  });

  it('should write a type-specific starter .shadowrc.json from the --type flag', async () => {
    fixtureDir = createFixtureDir('shadow-init-type-');
    writeFixtureFiles(fixtureDir, { 'package.json': JSON.stringify({ name: '@fixtures/svc', version: '1.0.0' }) });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir, type: 'backend' });

    const shadowrc = JSON.parse(read('.shadowrc.json'));
    expect(shadowrc.type).toBe('backend');
    expect(shadowrc.build.entry).toBe('src/main.ts');
  });

  it('should not clobber a hook with custom content', async () => {
    fixtureDir = createFixtureDir('shadow-init-custom-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }),
      '.husky/pre-commit': 'bun run my-custom-check\n',
    });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(read('.husky/pre-commit')).toBe('bun run my-custom-check');
  });

  it('should replace a known old commitlint hook when migrating', async () => {
    fixtureDir = createFixtureDir('shadow-init-migrate-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }),
      '.husky/commit-msg': 'bunx commitlint --edit $1\n',
    });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(read('.husky/commit-msg')).toBe('shadow commit-msg "$1"');
  });

  it('should leave an existing .shadowrc.json untouched', async () => {
    fixtureDir = createFixtureDir('shadow-init-existing-rc-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/init', version: '1.0.0' }),
      '.shadowrc.json': JSON.stringify({ build: { exports: { '.': 'main' } } }),
    });
    initGit(fixtureDir);

    await init({ cwd: fixtureDir });

    expect(JSON.parse(read('.shadowrc.json')).build.exports['.']).toBe('main');
  });
});
