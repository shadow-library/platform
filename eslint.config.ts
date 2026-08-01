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
const TEST_FILES = ['**/tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'];

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
 *
 * Every workspace lints against this single file — there is no per-workspace `eslint.config.ts` — so every
 * deviation from the base rules lives here as a `files`-scoped block. Blocks are grouped by concern, not by
 * workspace, and merge identical deviations shared by several workspaces into one block with multiple globs.
 */
export default defineConfig([
  ...baseConfig,
  ...reactLayer(DEFAULT_REACT_VERSION, WEB_APP_SCOPE),
  { files: [`${WEB_APP_SCOPE}/${SOURCE_FILES}`], languageOptions: { globals: globals.browser } },

  /**
   * Backend workspaces: declaration-merged namespaces carry the Fastify request augmentations, so
   * `@typescript-eslint/no-namespace` is off across every server.
   */
  {
    files: ['apps/identity-server/**/*.{ts,tsx}', 'apps/novel-forge-server/**/*.{ts,tsx}', 'apps/pulse-server/**/*.{ts,tsx}', 'apps/web-novel-server/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-namespace': 'off' },
  },

  /** identity-server also renders and ships the OIDC consent client from the same workspace: needs both global sets. */
  { files: ['apps/identity-server/**/*.{ts,tsx}'], languageOptions: { globals: resolveGlobals('both') } },

  /** Router/API modules whose return type is inferred (TanStack Router, generated API clients) — cannot be written out by hand. */
  {
    files: ['apps/identity-web/src/lib/apis/**/*.ts', 'apps/identity-web/src/router.tsx', 'apps/web-novel-web/src/lib/apis/*.api.ts', 'apps/web-novel-web/src/router.tsx'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },

  /** identity-web: autofocus is allowed on the app's own components. */
  { files: ['apps/identity-web/**/*.{ts,tsx}'], rules: { 'jsx-a11y/no-autofocus': 'off' } },

  /** novel-forge-web: autofocus is allowed on non-DOM components, and the label rule has to know the `Checkbox` wrapper. */
  {
    files: ['apps/novel-forge-web/**/*.tsx'],
    rules: {
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Checkbox'] }],
    },
  },

  /** packages/fastify: route specs declare unused fixture classes and stubs purely to exercise the decorators. */
  {
    files: ['packages/fastify/tests/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  /**
   * packages/ui: a primitive component library — needs the React/JSX layer plus both global sets (Storybook and
   * the SSR smoke script run under Node). It owns the interaction contract its consumers rely on, so the a11y
   * rules that assume application-level markup are off here and re-asserted by the apps. Stories and Storybook
   * config call hooks outside components by design.
   */
  ...reactLayer(DEFAULT_REACT_VERSION, 'packages/ui/**'),
  { files: ['packages/ui/**/*.{ts,tsx}'], languageOptions: { globals: resolveGlobals('both') } },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    files: ['packages/ui/**/*.stories.{ts,tsx}'],
    rules: { '@typescript-eslint/no-empty-function': 'off', '@typescript-eslint/explicit-module-boundary-types': 'off', 'react-hooks/rules-of-hooks': 'off' },
  },
  { files: ['packages/ui/.storybook/**/*.{ts,tsx}'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  { files: ['packages/ui/**/*.test.{ts,tsx}'], rules: { 'jsx-a11y/anchor-has-content': 'off', 'no-constant-binary-expression': 'off' } },
  /**
   * The SSR smoke harness is plain Node `.mjs`, outside every `*.{ts,tsx}` glob above (including the one
   * that declares Node globals), so `console` reads as undefined without this; its two inline
   * `onPageChange() {}` stubs are deliberate no-op handlers for components under test, same as the
   * `@typescript-eslint/no-empty-function` relaxation already granted to `.ts`/`.tsx` test files.
   */
  { files: ['packages/ui/tests/ssr-smoke.mjs'], languageOptions: { globals: globals.node }, rules: { '@typescript-eslint/no-empty-function': 'off' } },

  /** packages/web: hooks live in plain `.ts` files, and the offline/PWA/service-worker code needs both global sets. */
  ...reactLayer(DEFAULT_REACT_VERSION, 'packages/web/**'),
  { files: ['packages/web/**/*.{ts,tsx}'], languageOptions: { globals: resolveGlobals('both') } },
  /** `createRouter`'s return type is the inferred TanStack router type, which cannot be written out by hand. */
  { files: ['packages/web/src/router/create-router.ts'], rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } },
]);
