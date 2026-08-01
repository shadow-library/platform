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

/** `createRouter`'s return type is the inferred TanStack router type, which cannot be written out by hand. */
export default createConfig({
  react: true,
  globals: 'both',
  overrides: [{ files: ['src/router/create-router.ts'], rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } }],
});
