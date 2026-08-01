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

/** Both global sets: the server renders and ships the OIDC consent client from the same workspace. */
export default createConfig({
  globals: 'both',
  rules: { '@typescript-eslint/no-namespace': 'off' },
  overrides: [{ files: ['client/**/*.tsx'], rules: { 'jsx-a11y/no-autofocus': 'off' } }],
});
