/**
 * Importing npm packages
 */
import eslintJs from '@eslint/js';
import { type Linter } from 'eslint';
import nodePlugin from 'eslint-plugin-n';
import perfectionist from 'eslint-plugin-perfectionist';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Importing user defined packages
 */
import { type LintConfig } from '@lib/config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DEFAULT_IGNORES = ['**/dist/**', '**/node_modules/**', '**/*.gen.ts', '**/coverage/**'];

/**
 * The shipped base ESLint flat config, applied by `shadow verify` to every consuming repo so tooling
 * versions and rules stay identical across the ecosystem. Import ordering is delegated to
 * `eslint-plugin-perfectionist` (not `eslint-plugin-import`); `partitionByComment` keeps the four import
 * banner blocks intact while sorting within each. A repo layers its own `rules`/`ignores` on top through
 * `.shadowrc.json` `verify.lint`, so nothing here is locked in.
 */
export function createLintConfig(overrides: LintConfig = { rules: {}, ignores: [] }): Linter.Config[] {
  return defineConfig([
    { ignores: [...DEFAULT_IGNORES, ...overrides.ignores] },
    eslintJs.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
      files: ['**/*.ts'],
      languageOptions: { globals: globals.node },
      plugins: { n: nodePlugin, perfectionist },
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/no-dynamic-delete': 'off',
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true, allowStaticOnly: true }],
        '@typescript-eslint/no-explicit-any': 'off',
        'n/prefer-node-protocol': 'error',
        'no-console': 'error',
        'perfectionist/sort-imports': [
          'error',
          {
            type: 'natural',
            order: 'asc',
            ignoreCase: true,
            newlinesBetween: 'ignore',
            partitionByComment: true,
            internalPattern: ['^@lib/', '^@app/', '^@shadow-library/'],
            groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          },
        ],
        'perfectionist/sort-named-imports': ['error', { type: 'natural', order: 'asc', ignoreCase: true }],
        ...overrides.rules,
      },
    },
    {
      files: ['tests/**/*.spec.ts'],
      rules: {
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
        'no-console': 'off',
      },
    },
  ]) as Linter.Config[];
}
