/**
 * Importing npm packages
 */
import eslintJs from '@eslint/js';
import { type Linter } from 'eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nodePlugin from 'eslint-plugin-n';
import perfectionist from 'eslint-plugin-perfectionist';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Importing user defined packages
 */
import { type GlobalsEnv, type LintConfig } from '@lib/config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DEFAULT_IGNORES = ['**/dist/**', '**/node_modules/**', '**/*.gen.ts', '**/coverage/**'];
const SOURCE_FILES = ['**/*.{ts,tsx}'];
const JSX_FILES = ['**/*.{tsx,jsx}'];
const TEST_FILES = ['tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'];

/**
 * The React version handed to `eslint-plugin-react` when a repo doesn't declare one. Must be a concrete
 * version, never `'detect'`: the plugin's auto-detection calls `context.getFilename()`, removed in ESLint 9+,
 * so it throws under ESLint 10 — `verify` resolves the real version from the repo instead. This is the fallback.
 */
const DEFAULT_REACT_VERSION = '19.0';

/** Resolves the requested runtime-globals set — Node, browser, or the union of both — into ESLint's globals map. Defaults to Node. */
function resolveGlobals(env: GlobalsEnv | undefined): Record<string, boolean> {
  if (env === 'browser') return globals.browser;
  if (env === 'both') return { ...globals.node, ...globals.browser };
  return globals.node;
}

/**
 * The React/JSX layer, applied only when a repo declares (or auto-detects) React. Bundles `eslint-plugin-react`
 * (with the new JSX runtime, so `react-in-jsx-scope` is off, and `prop-types` off since TypeScript types
 * supersede it), `eslint-plugin-jsx-a11y`, and `eslint-plugin-react-hooks` (rules-of-hooks + exhaustive-deps).
 * React/a11y rules are scoped to JSX files; hook rules cover all `.ts`/`.tsx` so `.ts` custom hooks are checked.
 * `react.version` is pinned to a concrete value because the plugin's `'detect'` mode throws under ESLint 10.
 */
function reactLayer(version: string): Linter.Config[] {
  return [
    { files: JSX_FILES, settings: { react: { version } } },
    { ...reactPlugin.configs.flat.recommended, files: JSX_FILES },
    { ...reactPlugin.configs.flat['jsx-runtime'], files: JSX_FILES },
    { ...jsxA11y.flatConfigs.recommended, files: JSX_FILES },
    { files: JSX_FILES, rules: { 'react/prop-types': 'off' } },
    {
      files: SOURCE_FILES,
      plugins: { 'react-hooks': reactHooks },
      rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
    },
  ] as Linter.Config[];
}

/**
 * The shipped base ESLint flat config, applied by `shadow verify` to every consuming repo so tooling
 * versions and rules stay identical across the ecosystem. Covers `.ts` and `.tsx`; import ordering is
 * delegated to `eslint-plugin-perfectionist` (not `eslint-plugin-import`), with `partitionByComment`
 * keeping the four import banner blocks intact while sorting within each. A repo layers its own
 * `rules`/`ignores`/`overrides`, selects its `globals`, and toggles the React layer through
 * `.shadowrc.json` `verify.lint`, so nothing here is locked in.
 */
export function createLintConfig(overrides: LintConfig = { rules: {}, ignores: [], overrides: [], globals: 'node' }): Linter.Config[] {
  return defineConfig([
    { ignores: [...DEFAULT_IGNORES, ...overrides.ignores] },
    eslintJs.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    ...(overrides.react ? reactLayer(overrides.reactVersion ?? DEFAULT_REACT_VERSION) : []),
    {
      files: SOURCE_FILES,
      languageOptions: { globals: resolveGlobals(overrides.globals) },
      plugins: { n: nodePlugin, perfectionist },
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/no-dynamic-delete': 'off',
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true, allowStaticOnly: true }],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
        ...(overrides.rules as Linter.RulesRecord),
      },
    },
    {
      files: TEST_FILES,
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
    ...overrides.overrides.map(override => ({ files: override.files, rules: override.rules as Linter.RulesRecord })),
  ]) as Linter.Config[];
}
