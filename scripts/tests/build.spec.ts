/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { computeDistPackageJson, ensureShebang } from '@lib/build';
import { type BuildConfig } from '@lib/config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const backend = (exports: Record<string, string> = { '.': 'index' }, bin?: Record<string, string>): BuildConfig => ({ target: 'backend', exports, outDir: 'dist', bin });
const frontend = (exports: Record<string, string> = { '.': 'index' }): BuildConfig => ({ target: 'frontend', exports, outDir: 'dist' });

describe('build', () => {
  describe('computeDistPackageJson (backend)', () => {
    it('should synthesize main/module/types/exports for the default single root export', () => {
      const result = computeDistPackageJson({ name: 'pkg', version: '1.0.0' }, backend());
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
      const result = computeDistPackageJson({ name: 'pkg' }, backend({ '.': 'index', './errors': 'errors/index', './utils': 'utils/index' }));
      expect(result.exports).toMatchObject({
        './errors': { import: { default: './esm/errors/index.js' } },
        './utils': { import: { default: './esm/utils/index.js' } },
      });
      expect(result.typesVersions).toStrictEqual({
        '*': { errors: ['./esm/errors/index.d.ts'], utils: ['./esm/utils/index.d.ts'] },
      });
    });

    it('should rewrite src/-relative sideEffects entries to both output trees and pass globs through unchanged', () => {
      const result = computeDistPackageJson({ name: 'pkg', sideEffects: ['src/index.ts', 'src/reflector.service.ts', '**/index.js'] }, backend());
      expect(result.sideEffects).toStrictEqual(['./esm/index.js', './cjs/index.js', './esm/reflector.service.js', './cjs/reflector.service.js', '**/index.js']);
    });

    it('should write a bin map from config, one entry per binary, pointing at the esm output', () => {
      const result = computeDistPackageJson({ name: 'pkg' }, backend({ '.': 'index' }, { foo: 'bin/foo', bar: 'bin/bar' }));
      expect(result.bin).toStrictEqual({ foo: './esm/bin/foo.js', bar: './esm/bin/bar.js' });
    });
  });

  describe('computeDistPackageJson (frontend)', () => {
    it('should emit an ESM-only exports condition and point main at the esm output', () => {
      const result = computeDistPackageJson({ name: 'pkg' }, frontend());
      expect(result.main).toBe('./esm/index.js');
      expect(result.module).toBe('./esm/index.js');
      expect(result.exports).toStrictEqual({
        '.': { types: './esm/index.d.ts', default: './esm/index.js' },
        './package.json': './package.json',
      });
    });

    it('should rewrite src/-relative sideEffects into the esm tree only', () => {
      const result = computeDistPackageJson({ name: 'pkg', sideEffects: ['src/index.ts', '**/index.js'] }, frontend());
      expect(result.sideEffects).toStrictEqual(['./esm/index.js', '**/index.js']);
    });
  });

  describe('computeDistPackageJson (shared)', () => {
    it('should leave a boolean sideEffects untouched', () => {
      expect(computeDistPackageJson({ name: 'pkg', sideEffects: false }, backend()).sideEffects).toBe(false);
    });

    it('should strip scripts and devDependencies from the output', () => {
      const result = computeDistPackageJson({ name: 'pkg', scripts: { build: 'x' }, devDependencies: { x: '1' } }, backend());
      expect(result.scripts).toBeUndefined();
      expect(result.devDependencies).toBeUndefined();
    });

    it('should not mutate the input package.json', () => {
      const input = { name: 'pkg', sideEffects: ['src/index.ts'] };
      computeDistPackageJson(input, backend());
      expect(input.sideEffects).toStrictEqual(['src/index.ts']);
    });
  });

  describe('ensureShebang', () => {
    it('should prepend a bun shebang when missing', () => {
      expect(ensureShebang('console.log(1);')).toBe('#!/usr/bin/env bun\nconsole.log(1);');
    });

    it('should leave an existing shebang untouched', () => {
      expect(ensureShebang('#!/usr/bin/env node\nconsole.log(1);')).toBe('#!/usr/bin/env node\nconsole.log(1);');
    });
  });
});
