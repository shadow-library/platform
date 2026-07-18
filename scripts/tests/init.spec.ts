/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { missingDependencies } from '@lib/init';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('init', () => {
  describe('missingDependencies', () => {
    it('should return nothing for a type with no build tooling', () => {
      expect(missingDependencies({}, 'library')).toStrictEqual([]);
      expect(missingDependencies({}, 'backend')).toStrictEqual([]);
      expect(missingDependencies({}, 'spa')).toStrictEqual([]);
    });

    it('should list the component build tooling when none is declared', () => {
      const missing = missingDependencies({}, 'component');
      expect(missing).toContain('rollup');
      expect(missing).toContain('rollup-plugin-postcss');
      expect(missing).toContain('cssnano');
    });

    it('should skip packages already declared in any dependency block', () => {
      const packageJson = { devDependencies: { rollup: '^4.0.0', esbuild: '^0.28.0' }, dependencies: { postcss: '^8.0.0' } };
      const missing = missingDependencies(packageJson, 'component');
      expect(missing).not.toContain('rollup');
      expect(missing).not.toContain('esbuild');
      expect(missing).not.toContain('postcss');
      expect(missing).toContain('rollup-plugin-postcss');
    });

    it('should return an empty list once every component package is present', () => {
      const declared = Object.fromEntries(
        [
          'rollup',
          '@rollup/plugin-alias',
          '@rollup/plugin-node-resolve',
          'rollup-plugin-esbuild',
          'esbuild',
          'rollup-plugin-postcss',
          'postcss',
          'postcss-import',
          'rollup-plugin-banner2',
          'cssnano',
        ].map(name => [name, '*']),
      );
      expect(missingDependencies({ devDependencies: declared }, 'component')).toStrictEqual([]);
    });
  });
});
