/**
 * Importing npm packages.
 */
import eslintJs from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import globals from 'globals';
import eslintTs from 'typescript-eslint';

/**
 * Importing user defined packages.
 */

/**
 * Declaring the constants.
 */

export default [
  eslintJs.configs.recommended,
  ...eslintTs.configs.strict,
  ...eslintTs.configs.stylistic,
  importPlugin.flatConfigs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    settings: { 'import/resolver': { typescript: { project: 'tsconfig.json' } } },
    plugins: { n: nodePlugin },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true, allowStaticOnly: true }],
      'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import/newline-after-import': ['error', { considerComments: true }],
      'import/no-unresolved': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': 2,
      'n/prefer-node-protocol': ['error', { version: '>=23.0.0' }],
      'sort-imports': ['error', { ignoreDeclarationSort: true, allowSeparatedGroups: true }],
    },
  },
  {
    files: ['tests/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
