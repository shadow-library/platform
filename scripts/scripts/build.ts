/**
 * Importing npm packages
 */
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { buildLib } from '@lib/build-lib';
import { log } from '@lib/utils';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * This package dogfoods its own `build-lib` command — it is itself a tsc + tsc-alias dual ESM/CJS
 * library (see package.json `shadowLibrary.exports`), so there is no separate build script to
 * maintain, and every release doubles as an integration check of `build-lib` itself.
 */
buildLib({ cwd: path.join(import.meta.dirname, '..') }).catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
