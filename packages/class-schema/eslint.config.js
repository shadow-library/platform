/**
 * Importing npm packages.
 */
import eslintJs from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
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
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        programs: [tsParser.createProgram('tsconfig.json')],
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: 'tsconfig.json' },
      },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
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
      'sort-imports': ['error', { ignoreDeclarationSort: true, allowSeparatedGroups: true }],
    },
  },
];
