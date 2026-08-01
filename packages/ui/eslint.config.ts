/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { createConfig } from '../../eslint.config.ts';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * A primitive component library owns the interaction contract its consumers rely on, so the a11y rules that
 * assume application-level markup are off here and re-asserted by the apps. Stories and Storybook config call
 * hooks outside components by design.
 */
export default createConfig({
  react: true,
  globals: 'both',
  ignores: ['scripts/**'],
  rules: {
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/interactive-supports-focus': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    'jsx-a11y/no-noninteractive-tabindex': 'off',
    'jsx-a11y/no-autofocus': 'off',
  },
  overrides: [
    {
      files: ['**/*.stories.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'react-hooks/rules-of-hooks': 'off',
      },
    },
    { files: ['.storybook/**/*.{ts,tsx}'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
    { files: ['**/*.test.{ts,tsx}'], rules: { 'jsx-a11y/anchor-has-content': 'off', 'no-constant-binary-expression': 'off' } },
  ],
});
