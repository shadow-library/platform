import eslintJs from '@eslint/js';
import { type AST, type Linter, type Rule } from 'eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nodePlugin from 'eslint-plugin-n';
import perfectionist from 'eslint-plugin-perfectionist';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export type GlobalsEnv = 'node' | 'browser' | 'both';

export interface LintOverride {
  files: string[];
  rules: Linter.RulesRecord;
}

export interface LintOptions {
  react?: boolean;
  reactVersion?: string;
  globals?: GlobalsEnv;
  rules?: Linter.RulesRecord;
  ignores?: string[];
  overrides?: LintOverride[];
}

const DEFAULT_IGNORES = ['**/dist/**', '**/node_modules/**', '**/*.gen.ts', '**/coverage/**'];
const SOURCE_FILES = '*.{ts,tsx}';
const JSX_FILES = '*.{tsx,jsx}';
const TEST_FILES = ['**/tests/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'];

const SECTION_BANNERS = new Set([
  'Importing packages with side effects',
  'Importing side-effect packages',
  'Importing npm packages',
  'Importing user defined packages',
  'Defining types',
  'Declaring the constants',
  'Declaring the variables',
  'Declaring the tests',
  'Declaring the server',
]);

const noSectionBanner: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    schema: [],
    messages: { banner: 'Remove the section banner "{{text}}"; files open directly with their imports.' },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const text = comment.value
            .split('\n')
            .map(line => line.replace(/^\s*\*+/, '').trim())
            .filter(Boolean)
            .join(' ');
          if (!SECTION_BANNERS.has(text)) continue;
          const [start, end] = comment.range as [number, number];
          const lineStart = sourceCode.text.lastIndexOf('\n', start - 1) + 1;
          const ownsLine = sourceCode.text.slice(lineStart, start).trim() === '';
          const trailing = ownsLine ? (/^\s*/.exec(sourceCode.text.slice(end))?.[0].length ?? 0) : 0;
          context.report({ loc: comment.loc as AST.SourceLocation, messageId: 'banner', data: { text }, fix: fixer => fixer.removeRange([start, end + trailing]) });
        }
      },
    };
  },
};

const DANGLING_REFERENCE = /scratch-pad\/|PRD §|ADR-\d+|\bT-\d{2,}\b|\(D\d{2,}\)|\bD-\d{1,3}\b|\bP\d-\d+\b/;

const noDanglingReference: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { reference: 'Comment cites "{{reference}}", which lives outside the repository; state the rule itself instead.' },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const reference = DANGLING_REFERENCE.exec(comment.value)?.[0];
          if (reference) context.report({ loc: comment.loc as AST.SourceLocation, messageId: 'reference', data: { reference } });
        }
      },
    };
  },
};

// Never `'detect'`: the plugin's auto-detection calls `context.getFilename()`, removed in ESLint 9+, so it throws under ESLint 10.
const DEFAULT_REACT_VERSION = '19.2';

const WEB_APP_SCOPE = 'apps/*-web/**';

function resolveGlobals(env: GlobalsEnv | undefined): Record<string, boolean> {
  if (env === 'browser') return globals.browser;
  if (env === 'both') return { ...globals.node, ...globals.browser };
  return globals.node;
}

// react-hooks v7 ships the React Compiler's analysis as rules; `todo` is excluded because it only reports constructs the compiler could not lower, not defects.
const COMPILER_RULES: Linter.RulesRecord = Object.fromEntries(
  Object.keys(reactHooks.rules)
    .filter(name => name !== 'todo' && name !== 'rules-of-hooks' && name !== 'exhaustive-deps')
    .map(name => [`react-hooks/${name}`, 'error']),
);

// Hook rules cover all `.ts`/`.tsx` so custom hooks in plain `.ts` files are checked; React/a11y rules are JSX-only.
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
      rules: { ...COMPILER_RULES, 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
    },
  ] as Linter.Config[];
}

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
        // Import grouping is authored (external, then internal); only named specifiers are sorted.
        'perfectionist/sort-imports': 'off',
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

export const baseConfig = createConfig();

// The single config for every workspace; node globals stay in force for web apps because their Vite and config files run under Node.
export default defineConfig([
  ...baseConfig,
  ...reactLayer(DEFAULT_REACT_VERSION, WEB_APP_SCOPE),
  { files: [`${WEB_APP_SCOPE}/${SOURCE_FILES}`], languageOptions: { globals: globals.browser } },

  // Section banners are noise (autofixed away); a citation of a document outside the repository leaves the reader nothing to follow.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { local: { rules: { 'no-section-banner': noSectionBanner, 'no-dangling-reference': noDanglingReference } } },
    rules: { 'local/no-section-banner': 'error', 'local/no-dangling-reference': 'error' },
  },

  // `common/crypto` runs on `node:crypto` and handles master keys, so it must not reach a client bundle.
  {
    files: [`${WEB_APP_SCOPE}/${SOURCE_FILES}`, `packages/ui/**/${SOURCE_FILES}`, `packages/web/**/${SOURCE_FILES}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@shadow-library/common/crypto', message: '@shadow-library/common/crypto is server-only; decrypt on the server and send only what the client may see.' }],
        },
      ],
    },
  },

  // Declaration-merged namespaces carry the Fastify request augmentations in every server.
  {
    files: [
      'apps/identity-server/**/*.{ts,tsx}',
      'apps/novel-forge-server/**/*.{ts,tsx}',
      'apps/pulse-server/**/*.{ts,tsx}',
      'apps/web-novel-server/**/*.{ts,tsx}',
      'apps/memoir-server/**/*.{ts,tsx}',
      'apps/synapse-server/**/*.{ts,tsx}',
    ],
    rules: { '@typescript-eslint/no-namespace': 'off' },
  },

  // memoir-server: `OwnerScopedRepository` is the only sanctioned entry to user-owned tables, so raw client access outside repositories would skip owner scoping.
  {
    files: ['apps/memoir-server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='getPostgresClient']",
          message: 'getPostgresClient() is restricted to *.repository.ts files and database/ — reach user-owned tables through OwnerScopedRepository instead.',
        },
      ],
    },
  },
  {
    files: ['apps/memoir-server/**/*.repository.ts', 'apps/memoir-server/src/database/**/*.{ts,tsx}', 'apps/memoir-server/tests/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // novel-forge-server: a `db`/`tx` handle may be one transaction connection, and concurrent queries over it left connections idle in transaction;
  // `this.db` is the pool and may fan out.
  {
    files: ['apps/novel-forge-server/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='Promise'][callee.property.name=/^(all|allSettled|any|race)$/] Identifier[name=/^(db|tx|rawTx|executor|savepoint)$/]:not(MemberExpression[object.type='ThisExpression'] > Identifier.property):not(Property > Identifier.key)",
          message: 'Never fan out queries over a db/tx handle with Promise.all — it may be one transaction connection. Await them in turn.',
        },
      ],
    },
  },

  // identity-server also ships the OIDC consent client, so it needs both global sets.
  {
    files: ['apps/identity-server/**/*.{ts,tsx}'],
    languageOptions: { globals: resolveGlobals('both') },
  },

  // Return types are inferred (TanStack Router, generated API clients) and cannot be written out by hand.
  {
    files: ['apps/identity-web/src/lib/apis/**/*.ts', 'apps/identity-web/src/router.tsx', 'apps/web-novel-web/src/lib/apis/*.api.ts', 'apps/web-novel-web/src/router.tsx'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },

  // identity-web: autofocus is allowed on the app's own components.
  { files: ['apps/identity-web/**/*.{ts,tsx}'], rules: { 'jsx-a11y/no-autofocus': 'off' } },

  // novel-forge-web: autofocus is allowed on non-DOM components, and the label rule must know the `Checkbox` wrapper.
  {
    files: ['apps/novel-forge-web/**/*.tsx'],
    rules: {
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Checkbox'] }],
    },
  },

  // memoir-web Insights: a scrollable chart row needs keyboard reach, and `role="group"` is correct for it but not in jsx-a11y's default allowlist.
  {
    files: ['apps/memoir-web/src/features/insights/**/*.tsx'],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'group'] }],
    },
  },

  // novel-forge-web chapter panel: the resize divider is WAI-ARIA's focusable window splitter (`role="separator"`), which jsx-a11y counts as non-interactive.
  {
    files: ['apps/novel-forge-web/src/features/chat/ChapterPanel.tsx'],
    rules: {
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['separator'] }],
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
    },
  },

  // packages/fastify: route specs declare unused fixture classes and stubs purely to exercise the decorators.
  {
    files: ['packages/fastify/tests/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // packages/ui: a primitive library owns its interaction contract, so a11y rules assuming application markup are off here and re-asserted by the apps.
  // Stories call hooks outside components by design.
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
  // The SSR smoke harness is plain `.mjs`, outside every `*.{ts,tsx}` glob, so it gets Node globals; its `onPageChange() {}` stubs are deliberate no-ops.
  { files: ['packages/ui/tests/ssr-smoke.mjs'], languageOptions: { globals: globals.node }, rules: { '@typescript-eslint/no-empty-function': 'off' } },

  // e2e seed: a directly-invoked Bun CLI that prints a run summary to stdout.
  { files: ['e2e/seed/**/*.ts'], rules: { 'no-console': 'off' } },

  ...reactLayer(DEFAULT_REACT_VERSION, 'packages/web/**'),
  // packages/web: hooks live in plain `.ts` files, and offline/PWA/service-worker code needs both global sets.
  { files: ['packages/web/**/*.{ts,tsx}'], languageOptions: { globals: resolveGlobals('both') } },
  // `createRouter`'s inferred TanStack router type cannot be written out by hand.
  { files: ['packages/web/src/router/create-router.ts'], rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } },
]);
