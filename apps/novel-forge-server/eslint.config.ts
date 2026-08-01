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

/** Maintenance scripts report progress on stdout, so they keep `console`. */
export default createConfig({
  rules: { '@typescript-eslint/no-namespace': 'off' },
  overrides: [{ files: ['scripts/**'], rules: { 'no-console': 'off' } }],
});
