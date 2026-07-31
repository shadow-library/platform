/**
 * Importing npm packages
 */
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { type VerifyConfig } from '@lib/config';
import { log, run } from '@lib/utils';
import { runFormat, runLint } from '@lib/verify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const cwd = path.join(import.meta.dirname, '..');
const fix = process.argv.includes('--fix');

// scripts/ is root tooling, not a workspace — it has no package.json (and so no `.shadowrc.json`-driven
// type/test wiring to read). This mirrors `verify()`'s format → lint → type-check → test pipeline directly
// against its own known layout instead of going through the package.json-shaped `verify()` contract.
const VERIFY_CONFIG: VerifyConfig = {
  lint: { rules: {}, ignores: [], overrides: [], globals: 'node' },
  commit: { extends: [], rules: {} },
  lintFiles: '{src,tests,scripts}/**/*.ts',
  formatFiles: '{src,tests,scripts}/**/*.ts',
  test: true,
};

/** This package dogfoods its own format/lint/type-check/test — every change to the tooling is checked with the tooling. */
async function main(): Promise<number> {
  if (!(await runFormat(cwd, VERIFY_CONFIG, fix))) return 1;
  if (!(await runLint(cwd, VERIFY_CONFIG, fix))) return 1;

  log.info('run    type-check (tsc --noEmit)');
  const typeCheck = run('bunx', ['tsc', '--noEmit'], { cwd });
  if (typeCheck.status !== 0) return typeCheck.status;

  log.info('run    test (bun test)');
  const test = run('bun', ['test'], { cwd });
  return test.status;
}

main()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
