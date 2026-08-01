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

/**
 * Defining types
 */
/** Which runtime globals the config treats as defined — a Node workspace, a browser workspace, or both. */
export type GlobalsEnv = 'node' | 'browser' | 'both';

/** A file-scoped rule override layered after the base config (e.g. relaxing rules for stories or fixtures). */
export interface LintOverride {
  files: string[];
  rules: Linter.RulesRecord;
}

/** The per-workspace deviations a workspace `eslint.config.ts` hands to {@link createConfig}. */
export interface LintOptions {
  /** Enable the React/JSX/a11y layer. */
  react?: boolean;
  /** React version handed to `eslint-plugin-react`; its `'detect'` mode throws under ESLint 10. */
  reactVersion?: string;
  /** Runtime globals treated as defined. Defaults to Node. */
  globals?: GlobalsEnv;
  /** Rules merged over the base rule block, scoped to every `.ts`/`.tsx` source file. */
  rules?: Linter.RulesRecord;
  /** Extra ignore globs appended to the shared defaults, relative to the config file's directory. */
  ignores?: string[];
  /** File-scoped overrides appended last, so they win over both the base rules and the test-file relaxations. */
  overrides?: LintOverride[];
}

/**
 * Declaring the constants
 */
const DEFAULT_IGNORES = ['**/dist/**', '**/node_modules/**', '**/*.gen.ts', '**/coverage/**'];
const SOURCE_FILES = '*.{ts,tsx}';
const JSX_FILES = '*.{tsx,jsx}';
const TEST_FILES = ['tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'];

/**
 * Concrete React version for `eslint-plugin-react`. Never `'detect'`: the plugin's auto-detection calls
 * `context.getFilename()`, removed in ESLint 9+, so it throws under ESLint 10. Pinned to the `react` version
 * the root `package.json` catalog resolves for every workspace.
 */
const DEFAULT_REACT_VERSION = '19.2';

/**
 * Path scope for web apps that carry no `eslint.config.ts` of their own — they still need the React layer and
 * browser globals, which the root config cannot infer from a workspace-local file that does not exist.
 */
const WEB_APP_SCOPE = 'apps/*-web/**';

/** Resolves the requested runtime-globals set — Node, browser, or the union of both — into ESLint's globals map. */
function resolveGlobals(env: GlobalsEnv | undefined): Record<string, boolean> {
  if (env === 'browser') return globals.browser;
  if (env === 'both') return { ...globals.node, ...globals.browser };
  return globals.node;
}

/**
 * The React/JSX layer. Bundles `eslint-plugin-react` (with the new JSX runtime, so `react-in-jsx-scope` is off,
 * and `prop-types` off since TypeScript types supersede it), `eslint-plugin-jsx-a11y`, and
 * `eslint-plugin-react-hooks`. React/a11y rules are scoped to JSX files; hook rules cover all `.ts`/`.tsx` so
 * `.ts` custom hooks are checked. `scope` narrows the layer to a subtree — used by the root config to reach web
 * apps that have no config file of their own.
 */
export function reactLayer(version: string = DEFAULT_REACT_VERSION, scope = '**'): Linter.Config[] {
  const jsxFiles = [`${scope}/${JSX_FILES}`];
  const sourceFiles = [`${scope}/${SOURCE_FILES}`];
  return [
    { files: jsxFiles, settings: { react: { version } } },
    { ...reactPlugin.configs.flat.recommended, files: jsxFiles },
    { ...reactPlugin.configs.flat['jsx-runtime'], files: jsxFiles },
    { ...jsxA11y.flatConfigs.recommended, files: jsxFiles },
    { files: jsxFiles, rules: { 'react/prop-types': 'off' } },
    {
      files: sourceFiles,
      plugins: { 'react-hooks': reactHooks },
      rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
    },
  ] as Linter.Config[];
}

/**
 * The shared flat config every workspace lints with, so tooling versions and rules stay identical across the
 * platform. Covers `.ts` and `.tsx`; import ordering is delegated to `eslint-plugin-perfectionist` (not
 * `eslint-plugin-import`), with `partitionByComment` keeping the four import banner blocks intact while sorting
 * within each. A workspace layers its own rules, ignores, overrides and globals by calling this from its own
 * `eslint.config.ts`; ESLint's per-file config lookup then picks the nearest one.
 */
export function createConfig(options: LintOptions = {}): Linter.Config[] {
  return defineConfig([
    { ignores: [...DEFAULT_IGNORES, ...(options.ignores ?? [])] },
    eslintJs.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    ...(options.react ? reactLayer(options.reactVersion) : []),
    {
      files: [`**/${SOURCE_FILES}`],
      languageOptions: { globals: resolveGlobals(options.globals) },
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
            // Pinned so `bun:*` specifiers group as builtins no matter which runtime hosts the ESLint CLI.
            environment: 'bun',
            newlinesBetween: 'ignore',
            partitionByComment: true,
            internalPattern: ['^@lib/', '^@app/', '^@shadow-library/'],
            groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          },
        ],
        'perfectionist/sort-named-imports': ['error', { type: 'natural', order: 'asc', ignoreCase: true }],
        ...options.rules,
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
    ...(options.overrides ?? []).map(override => ({ files: override.files, rules: override.rules })),
  ]) as Linter.Config[];
}

/** The unmodified base — Node globals, no React — for workspaces that only need to append to it. */
export const baseConfig = createConfig();

/**
 * ESLint requires a default export from a config file; this is the framework exception to the named-export rule.
 * Node globals stay in force for the web-app scope because those apps' Vite and config files run under Node.
 */
export default defineConfig([
  ...baseConfig,
  ...reactLayer(DEFAULT_REACT_VERSION, WEB_APP_SCOPE),
  { files: [`${WEB_APP_SCOPE}/${SOURCE_FILES}`], languageOptions: { globals: globals.browser } },
]);
