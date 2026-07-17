/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { computeDistPackageJson, ensureShebang, resolveExportsConfig } from '@lib/build-lib';
import { ShadowScriptsError } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('build-lib', () => {
  describe('resolveExportsConfig', () => {
    it('should default to a single root export when shadowLibrary.exports is absent', () => {
      expect(resolveExportsConfig({ name: 'pkg' })).toStrictEqual({
        '.': 'index',
      });
    });

    it('should return the declared exports map as-is', () => {
      const shadowLibrary = {
        exports: { '.': 'index', './errors': 'errors/index' },
      };
      expect(resolveExportsConfig({ name: 'pkg', shadowLibrary })).toStrictEqual(shadowLibrary.exports);
    });

    it('should throw when the declared map has no "." entry', () => {
      expect(() =>
        resolveExportsConfig({
          name: 'pkg',
          shadowLibrary: { exports: { './errors': 'errors/index' } },
        }),
      ).toThrow(ShadowScriptsError);
    });
  });

  describe('computeDistPackageJson', () => {
    it('should synthesize main/module/types/exports from the default single root export', () => {
      const result = computeDistPackageJson({ name: 'pkg', version: '1.0.0' });
      expect(result.main).toBe('./cjs/index.js');
      expect(result.module).toBe('./esm/index.js');
      expect(result.types).toBe('./esm/index.d.ts');
      expect(result.exports).toStrictEqual({
        '.': {
          import: { types: './esm/index.d.ts', default: './esm/index.js' },
          require: { types: './cjs/index.d.ts', default: './cjs/index.js' },
        },
        './package.json': './package.json',
      });
      expect(result.typesVersions).toBeUndefined();
    });

    it('should build exports and typesVersions for every declared subpath', () => {
      const shadowLibrary = {
        exports: {
          '.': 'index',
          './errors': 'errors/index',
          './utils': 'utils/index',
        },
      };
      const result = computeDistPackageJson({ name: 'pkg', shadowLibrary });
      expect(result.exports).toMatchObject({
        './errors': { import: { default: './esm/errors/index.js' } },
        './utils': { import: { default: './esm/utils/index.js' } },
      });
      expect(result.typesVersions).toStrictEqual({
        '*': {
          errors: ['./esm/errors/index.d.ts'],
          utils: ['./esm/utils/index.d.ts'],
        },
      });
    });

    it('should rewrite src/-relative sideEffects entries to both output trees and pass globs through unchanged', () => {
      const result = computeDistPackageJson({
        name: 'pkg',
        sideEffects: ['src/index.ts', 'src/reflector.service.ts', '**/index.js'],
      });
      expect(result.sideEffects).toStrictEqual(['./esm/index.js', './cjs/index.js', './esm/reflector.service.js', './cjs/reflector.service.js', '**/index.js']);
    });

    it('should leave a boolean sideEffects untouched', () => {
      expect(computeDistPackageJson({ name: 'pkg', sideEffects: false }).sideEffects).toBe(false);
    });

    it('should rewrite a string "bin" shorthand using the unscoped package name', () => {
      const result = computeDistPackageJson({
        name: '@shadow-library/my-cli',
        bin: 'bin/my-cli',
      });
      expect(result.bin).toStrictEqual({ 'my-cli': './esm/bin/my-cli.js' });
    });

    it('should rewrite an object "bin" map, one entry per binary', () => {
      const result = computeDistPackageJson({
        name: 'pkg',
        bin: { foo: 'bin/foo', bar: 'bin/bar' },
      });
      expect(result.bin).toStrictEqual({
        foo: './esm/bin/foo.js',
        bar: './esm/bin/bar.js',
      });
    });

    it('should strip scripts, devDependencies, and shadowLibrary from the output', () => {
      const result = computeDistPackageJson({
        name: 'pkg',
        scripts: { build: 'x' },
        devDependencies: { x: '1' },
        shadowLibrary: { exports: { '.': 'index' } },
      });
      expect(result.scripts).toBeUndefined();
      expect(result.devDependencies).toBeUndefined();
      expect(result.shadowLibrary).toBeUndefined();
    });

    it('should not mutate the input package.json', () => {
      const input = { name: 'pkg', sideEffects: ['src/index.ts'] };
      computeDistPackageJson(input);
      expect(input.sideEffects).toStrictEqual(['src/index.ts']);
    });
  });

  describe('ensureShebang', () => {
    it('should prepend a node shebang when missing', () => {
      expect(ensureShebang('console.log(1);')).toBe('#!/usr/bin/env node\nconsole.log(1);');
    });

    it('should leave an existing shebang untouched', () => {
      expect(ensureShebang('#!/usr/bin/env bun\nconsole.log(1);')).toBe('#!/usr/bin/env bun\nconsole.log(1);');
    });
  });
});
