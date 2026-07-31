/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { findScript, readPackageJson, resolveExistingDir, ShadowError } from '@lib/utils';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from '../helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('utils/package-json', () => {
  describe('findScript', () => {
    it('should return the first matching script name in priority order', () => {
      expect(findScript({ typecheck: 'tsc --noEmit' }, ['type-check', 'typecheck'])).toStrictEqual({ name: 'typecheck', command: 'tsc --noEmit' });
    });

    it('should prefer an earlier name when both exist', () => {
      expect(findScript({ 'type-check': 'a', typecheck: 'b' }, ['type-check', 'typecheck'])).toStrictEqual({ name: 'type-check', command: 'a' });
    });

    it('should return undefined when nothing matches', () => {
      expect(findScript({ lint: 'x' }, ['test'])).toBeUndefined();
    });

    it('should return undefined when scripts is undefined', () => {
      expect(findScript(undefined, ['test'])).toBeUndefined();
    });
  });

  describe('resolveExistingDir', () => {
    let fixtureDir: string | undefined;

    afterEach(() => {
      if (fixtureDir) removeFixtureDir(fixtureDir);
      fixtureDir = undefined;
    });

    it('should default to cwd when dirArg is undefined', () => {
      fixtureDir = createFixtureDir('shadow-scripts-resolve-dir-');
      expect(resolveExistingDir(undefined, fixtureDir)).toBe(fixtureDir);
    });

    it('should resolve a relative dirArg against cwd', () => {
      fixtureDir = createFixtureDir('shadow-scripts-resolve-dir-rel-');
      writeFixtureFiles(fixtureDir, { 'sub/.gitkeep': '' });
      expect(resolveExistingDir('sub', fixtureDir)).toBe(`${fixtureDir}/sub`);
    });

    it('should throw for a path that does not exist', () => {
      fixtureDir = createFixtureDir('shadow-scripts-resolve-dir-missing-');
      expect(() => resolveExistingDir('nope', fixtureDir!)).toThrow(ShadowError);
    });

    it('should throw for a path that is a file, not a directory', () => {
      fixtureDir = createFixtureDir('shadow-scripts-resolve-dir-file-');
      writeFixtureFiles(fixtureDir, { 'file.txt': 'x' });
      expect(() => resolveExistingDir('file.txt', fixtureDir!)).toThrow(ShadowError);
    });
  });

  describe('readPackageJson', () => {
    let fixtureDir: string | undefined;

    afterEach(() => {
      if (fixtureDir) removeFixtureDir(fixtureDir);
      fixtureDir = undefined;
    });

    it('should read and parse an existing package.json', () => {
      fixtureDir = createFixtureDir('shadow-scripts-read-pkg-');
      writeFixtureFiles(fixtureDir, {
        'package.json': JSON.stringify({ name: 'x' }),
      });
      expect(readPackageJson(fixtureDir).data).toStrictEqual({ name: 'x' });
    });

    it('should throw when package.json is missing', () => {
      fixtureDir = createFixtureDir('shadow-scripts-read-pkg-missing-');
      expect(() => readPackageJson(fixtureDir!)).toThrow(ShadowError);
    });

    it('should throw when package.json is not valid JSON', () => {
      fixtureDir = createFixtureDir('shadow-scripts-read-pkg-invalid-');
      writeFixtureFiles(fixtureDir, { 'package.json': '{ not valid json' });
      expect(() => readPackageJson(fixtureDir!)).toThrow(ShadowError);
    });
  });
});
