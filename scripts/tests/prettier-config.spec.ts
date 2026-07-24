/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PRETTIER_CONFIG, renderPrettierConfig } from '@lib/prettier-config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('prettier-config', () => {
  describe('PRETTIER_CONFIG', () => {
    it('should be the canonical ecosystem ruleset', () => {
      expect(PRETTIER_CONFIG).toStrictEqual({ singleQuote: true, trailingComma: 'all', printWidth: 180, arrowParens: 'avoid' });
    });
  });

  describe('renderPrettierConfig', () => {
    it('should render valid, pretty-printed JSON with a trailing newline', () => {
      const rendered = renderPrettierConfig();
      expect(rendered.endsWith('\n')).toBe(true);
      expect(rendered).toContain('\n  "singleQuote": true');
      expect(JSON.parse(rendered)).toStrictEqual(PRETTIER_CONFIG);
    });
  });
});
