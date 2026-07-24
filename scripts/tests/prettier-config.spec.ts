/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PRETTIER_BASE } from '@lib/config';
import prettierDefault, { getPrettierConfig, mergePrettierConfig } from '@lib/prettier-config';

import { createFixtureDir, removeFixtureDir, writeFixtureFiles } from './helpers/fixture';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('prettier-config', () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) removeFixtureDir(fixtureDir);
    fixtureDir = undefined;
  });

  describe('mergePrettierConfig', () => {
    it('should return the base ruleset when there are no overrides', () => {
      expect(mergePrettierConfig()).toStrictEqual(PRETTIER_BASE);
      expect(mergePrettierConfig({})).toStrictEqual(PRETTIER_BASE);
    });

    it('should layer overrides over the base ruleset', () => {
      const merged = mergePrettierConfig({ printWidth: 100, semi: false });
      expect(merged).toMatchObject({ singleQuote: true, trailingComma: 'all', arrowParens: 'avoid', printWidth: 100, semi: false });
    });

    it('should not mutate the base ruleset', () => {
      mergePrettierConfig({ printWidth: 60 });
      expect(PRETTIER_BASE.printWidth).toBe(180);
    });
  });

  describe('getPrettierConfig', () => {
    it('should return the base ruleset for a repo with no .shadowrc.json', () => {
      fixtureDir = createFixtureDir('shadow-prettier-defaults-');
      expect(getPrettierConfig(fixtureDir)).toStrictEqual(PRETTIER_BASE);
    });

    it('should fold in the repo .shadowrc.json verify.format overrides', () => {
      fixtureDir = createFixtureDir('shadow-prettier-overrides-');
      writeFixtureFiles(fixtureDir, { '.shadowrc.json': JSON.stringify({ verify: { format: { printWidth: 120, quoteProps: 'consistent' } } }) });
      expect(getPrettierConfig(fixtureDir)).toMatchObject({ singleQuote: true, printWidth: 120, quoteProps: 'consistent' });
    });
  });

  describe('default export', () => {
    it('should be the static base ruleset (for the "prettier": "@shadow-library/scripts/prettier" key)', () => {
      expect(prettierDefault).toStrictEqual(PRETTIER_BASE);
    });
  });
});
