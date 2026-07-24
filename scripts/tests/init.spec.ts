/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { hasForeignPrettierConfig, missingDependencies } from '@lib/init';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('init', () => {
  describe('hasForeignPrettierConfig', () => {
    let fixtureDir: string | undefined;

    afterEach(() => {
      if (fixtureDir) removeFixtureDir(fixtureDir);
      fixtureDir = undefined;
    });

    it('should be false for a repo with no prettier config', () => {
      fixtureDir = createFixtureDir('shadow-prettier-none-');
      expect(hasForeignPrettierConfig(fixtureDir, {})).toBe(false);
    });

    it('should ignore the managed prettier.config.mjs itself', () => {
      fixtureDir = createFixtureDir('shadow-prettier-managed-');
      writeFixtureFiles(fixtureDir, { 'prettier.config.mjs': 'export default {};' });
      expect(hasForeignPrettierConfig(fixtureDir, {})).toBe(false);
    });

    it('should detect a package.json "prettier" key', () => {
      fixtureDir = createFixtureDir('shadow-prettier-pkgkey-');
      expect(hasForeignPrettierConfig(fixtureDir, { prettier: { printWidth: 100 } })).toBe(true);
    });

    it('should detect another prettier config file', () => {
      fixtureDir = createFixtureDir('shadow-prettier-foreign-');
      writeFixtureFiles(fixtureDir, { '.prettierrc.json': '{}' });
      expect(hasForeignPrettierConfig(fixtureDir, {})).toBe(true);
    });
  });

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
