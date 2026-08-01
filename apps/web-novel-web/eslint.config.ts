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

/** Build scripts log to stdout; the router and API modules infer their own return types. */
export default createConfig({
  react: true,
  globals: 'both',
  overrides: [
    { files: ['scripts/**/*.ts'], rules: { 'no-console': 'off' } },
    { files: ['src/lib/apis/*.api.ts', 'src/router.tsx'], rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } },
  ],
});
