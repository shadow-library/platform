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

/** Autofocus is allowed on the app's own components, and the label rule has to know the `Checkbox` wrapper. */
export default createConfig({
  react: true,
  globals: 'both',
  overrides: [
    {
      files: ['**/*.tsx'],
      rules: {
        'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
        'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Checkbox'] }],
      },
    },
  ],
});
