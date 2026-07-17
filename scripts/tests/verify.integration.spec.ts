/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

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

describe('verify (integration)', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  it('should run every step that exists and pass when they all succeed', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-verify-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/verify-ok',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          'type-check': 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
        },
      }),
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });

  it('should skip a step whose script is absent, including "test" for library-style repos', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-verify-skip-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/verify-no-test',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          'type-check': 'node -e "process.exit(0)"',
        },
      }),
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });

  it('should accept the "typecheck" alias when "type-check" is absent', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-verify-alias-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/verify-alias',
        scripts: {
          lint: 'node -e "process.exit(0)"',
          typecheck: 'node -e "process.exit(1)"',
        },
      }),
    });

    // typecheck script fails on purpose — proves the alias was actually picked up and run, not silently skipped
    await expect(verify({ cwd: fixtureDir })).resolves.toBe(1);
  });

  it('should stop at the first failing step and return its exit code', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-verify-fail-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/verify-fail',
        scripts: {
          lint: 'node -e "process.exit(3)"',
          test: 'node -e "process.exit(0)"',
        },
      }),
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(3);
  });

  it('should skip a step that maps back to "shadow-scripts verify" instead of recursing', async () => {
    fixtureDir = createFixtureDir('shadow-scripts-verify-recursive-');
    writeFixtureFiles(fixtureDir, {
      'package.json': JSON.stringify({
        name: '@fixtures/verify-recursive',
        scripts: {
          lint: 'shadow-scripts verify',
          test: 'node -e "process.exit(0)"',
        },
      }),
    });

    await expect(verify({ cwd: fixtureDir })).resolves.toBe(0);
  });
});
