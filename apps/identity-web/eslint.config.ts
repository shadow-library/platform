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

/** Server-rendered React app: both global sets, and the router/API modules infer their own return types. */
export default createConfig({
  react: true,
  globals: 'both',
  rules: { 'jsx-a11y/no-autofocus': 'off' },
  overrides: [{ files: ['src/lib/apis/**/*.ts', 'src/router.tsx'], rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' } }],
});
