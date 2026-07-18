/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type LintConfig } from '@lib/config';
import { createLintConfig } from '@lib/eslint-config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const base: LintConfig = { rules: {}, ignores: [], overrides: [], globals: 'node' };

/** Collects every plugin key registered across the flat-config blocks. */
const pluginKeys = (config: ReturnType<typeof createLintConfig>): string[] => config.flatMap(block => Object.keys((block as { plugins?: Record<string, unknown> }).plugins ?? {}));

describe('eslint-config', () => {
  describe('createLintConfig', () => {
    it('should not register React plugins by default', () => {
      const keys = pluginKeys(createLintConfig(base));
      expect(keys).not.toContain('react-hooks');
      expect(keys).not.toContain('react');
    });

    it('should register the React trio when react is enabled', () => {
      const config = createLintConfig({ ...base, react: true });
      const keys = pluginKeys(config);
      expect(keys).toContain('react-hooks');
      // react and jsx-a11y come from the spread flat presets, applied to jsx files
      const hasJsxScopedBlock = config.some(block => Array.isArray(block.files) && block.files.includes('**/*.{tsx,jsx}'));
      expect(hasJsxScopedBlock).toBe(true);
    });

    it('should cover both .ts and .tsx in the base rule block', () => {
      const config = createLintConfig(base);
      const baseBlock = config.find(block => (block.rules as Record<string, unknown> | undefined)?.['no-console'] === 'error');
      expect(baseBlock?.files).toStrictEqual(['**/*.{ts,tsx}']);
    });

    it('should ignore underscore-prefixed args and vars in the base no-unused-vars rule', () => {
      const config = createLintConfig(base);
      const baseBlock = config.find(block => (block.rules as Record<string, unknown> | undefined)?.['no-console'] === 'error');
      expect((baseBlock?.rules as Record<string, unknown>)['@typescript-eslint/no-unused-vars']).toStrictEqual([
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ]);
    });

    it('should append consumer file-scoped overrides last', () => {
      const config = createLintConfig({ ...base, overrides: [{ files: ['**/*.stories.tsx'], rules: { 'no-console': 'off' } }] });
      const last = config.at(-1);
      expect(last?.files).toStrictEqual(['**/*.stories.tsx']);
      expect(last?.rules).toStrictEqual({ 'no-console': 'off' });
    });
  });
});
