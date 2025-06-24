/**
 * Importing npm packages
 */
import { SpawnSyncOptions, spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const isFixEnabled = process.argv.includes('--fix');
const fileGlob = '{src,tests,scripts}/**/*.ts';
const cwd = join(import.meta.dirname, '..');
const options = { cwd, stdio: 'inherit' } satisfies SpawnSyncOptions;

if (isFixEnabled) {
  const prettierResult = spawnSync('bunx', ['prettier', '--write', '--log-level', 'error', fileGlob], options);
  const eslintResult = spawnSync('bunx', ['eslint', '--fix', fileGlob], options);
  if (prettierResult.status !== 0 || eslintResult.status !== 0) process.exit(1);
} else {
  const prettierResult = spawnSync('bunx', ['prettier', '-c', '--log-level', 'error', fileGlob], options);
  const eslintResult = spawnSync('bunx', ['eslint', fileGlob], options);
  if (prettierResult.status !== 0 || eslintResult.status !== 0) process.exit(1);
}
