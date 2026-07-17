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
const cfg = (exports: Record<string, string> = { '.': 'index' }, bin?: Record<string, string>): BuildConfig => ({ exports, outDir: 'dist', bin });

describe('build', () => {
  describe('computeDistPackageJson', () => {
    it('should synthesize main/module/types/exports for the default single root export', () => {
      const result = computeDistPackageJson({ name: 'pkg', version: '1.0.0' }, cfg());
      expect(result.type).toBe('module');
      expect(result.main).toBe('./index.js');
      expect(result.module).toBe('./index.js');
      expect(result.types).toBe('./index.d.ts');
      expect(result.exports).toStrictEqual({
        '.': { types: './index.d.ts', default: './index.js' },
        './package.json': './package.json',
      });
      expect(result.typesVersions).toBeUndefined();
    });

    it('should build exports and typesVersions for every declared subpath', () => {
      const result = computeDistPackageJson({ name: 'pkg' }, cfg({ '.': 'index', './errors': 'errors/index', './utils': 'utils/index' }));
      expect(result.exports).toStrictEqual({
        '.': { types: './index.d.ts', default: './index.js' },
        './errors': { types: './errors/index.d.ts', default: './errors/index.js' },
        './utils': { types: './utils/index.d.ts', default: './utils/index.js' },
        './package.json': './package.json',
      });
      expect(result.typesVersions).toStrictEqual({
        '*': { errors: ['./errors/index.d.ts'], utils: ['./utils/index.d.ts'] },
      });
    });

    it('should rewrite src/-relative sideEffects entries and pass globs through unchanged', () => {
      const result = computeDistPackageJson({ name: 'pkg', sideEffects: ['src/index.ts', 'src/reflector.service.ts', '**/index.js'] }, cfg());
      expect(result.sideEffects).toStrictEqual(['./index.js', './reflector.service.js', '**/index.js']);
    });

    it('should write a bin map from config, one entry per binary, pointing at the output', () => {
      const result = computeDistPackageJson({ name: 'pkg' }, cfg({ '.': 'index' }, { foo: 'bin/foo', bar: 'bin/bar' }));
      expect(result.bin).toStrictEqual({ foo: './bin/foo.js', bar: './bin/bar.js' });
    });

    it('should leave a boolean sideEffects untouched', () => {
      expect(computeDistPackageJson({ name: 'pkg', sideEffects: false }, cfg()).sideEffects).toBe(false);
    });

    it('should strip scripts and devDependencies from the output', () => {
      const result = computeDistPackageJson({ name: 'pkg', scripts: { build: 'x' }, devDependencies: { x: '1' } }, cfg());
      expect(result.scripts).toBeUndefined();
      expect(result.devDependencies).toBeUndefined();
    });

    it('should not mutate the input package.json', () => {
      const input = { name: 'pkg', sideEffects: ['src/index.ts'] };
      computeDistPackageJson(input, cfg());
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
