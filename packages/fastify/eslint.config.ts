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

/** The route specs declare unused fixture classes and stubs purely to exercise the decorators. */
export default createConfig({
  overrides: [
    {
      files: ['tests/**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
});
