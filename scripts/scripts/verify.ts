/**
 * Importing npm packages
 */
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { log } from '@lib/utils';
import { verify } from '@lib/verify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * This package dogfoods its own `verify` command for local checks — format + lint (via the shipped
 * ESLint flat config) then type-check + test. Pass `--fix` to apply formatting and lint fixes in place.
 */
verify({ cwd: path.join(import.meta.dirname, '..'), fix: process.argv.includes('--fix') })
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
