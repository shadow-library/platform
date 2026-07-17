/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { verify } from '@lib/verify';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CLEAN_SOURCE = 'export const value = 1;\n';
const noopScript = 'node -e "process.exit(0)"';
const failScript = 'node -e "process.exit(1)"';

describe('verify (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should pass when formatting, linting, and the delegated steps all succeed', async () => {
    fixtureDir = createFixtureDir('shadow-verify-ok-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/ok', scripts: { 'type-check': noopScript, test: noopScript } }),
      'src/index.ts': CLEAN_SOURCE,
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });

  it('should fail when a source file is not formatted', async () => {
    fixtureDir = createFixtureDir('shadow-verify-fmt-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/fmt' }),
      'src/index.ts': 'export const value=1',
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(1);
  });

  it('should format in place under --fix and then pass', async () => {
    fixtureDir = createFixtureDir('shadow-verify-fix-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/fix' }),
      'src/index.ts': 'export const value=1',
    });

    await expect(verify({ cwd: fixtureDir, fix: true })).resolves.toBe(0);
    expect(fs.readFileSync(path.join(fixtureDir, 'src/index.ts'), 'utf-8')).toBe(CLEAN_SOURCE);
  });

  it('should fail when linting finds an error in a well-formatted file', async () => {
    fixtureDir = createFixtureDir('shadow-verify-lint-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/lint' }),
      'src/index.ts': 'const unused = 2;\nexport const value = 1;\n',
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(1);
  });

  it('should honor a lint rule override from .shadowrc.json', async () => {
    fixtureDir = createFixtureDir('shadow-verify-override-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/override' }),
      '.shadowrc.json': JSON.stringify({ verify: { lint: { rules: { '@typescript-eslint/no-unused-vars': 'off' } } } }),
      'src/index.ts': 'const unused = 2;\nexport const value = 1;\n',
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });

  it('should stop at a failing delegated type-check and return its exit code', async () => {
    fixtureDir = createFixtureDir('shadow-verify-tc-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/tc', scripts: { typecheck: failScript } }),
      'src/index.ts': CLEAN_SOURCE,
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(1);
  });

  it('should skip a delegated step that maps back to "shadow verify" instead of recursing', async () => {
    fixtureDir = createFixtureDir('shadow-verify-recursive-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({ name: '@fixtures/recursive', scripts: { test: 'shadow verify' } }),
      'src/index.ts': CLEAN_SOURCE,
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });
});
