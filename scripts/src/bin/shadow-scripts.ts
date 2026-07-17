/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { buildLib } from '@lib/build-lib';
import { checkMigrations } from '@lib/check-migrations';
import { genApiTypes } from '@lib/gen-api-types';
import { release } from '@lib/release';
import { ShadowScriptsError, log } from '@lib/utils';
import { verify } from '@lib/verify';

import { parseArgs } from './args';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const HELP_TEXT = `shadow-scripts — shared CLI for the Shadow Library ecosystem

Usage:
  shadow-scripts build-lib
  shadow-scripts verify
  shadow-scripts gen-api-types <url> [--out <path>]
  shadow-scripts release <bump> [--path <path>]
  shadow-scripts check-migrations [--dir <path>]

Commands:
  build-lib             Clean, compile (ESM + CJS), and package the library in the current repo
  verify                Run lint, type-check, and test — skipping steps the repo doesn't define
  gen-api-types <url>    Fetch an OpenAPI document and generate TypeScript types
  release <bump>          patch | minor | major | prepatch | preminor | premajor
  check-migrations       Fail if "db:generate" leaves uncommitted migration changes

See https://github.com/shadow-library/scripts#readme for full documentation.
`;

/** Parses argv, dispatches to the matching command, and returns the process exit code. No business logic lives here. */
async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    log.info(HELP_TEXT);
    return 1;
  }
  if (command === '--help' || command === '-h') {
    log.info(HELP_TEXT);
    return 0;
  }

  const { positionals, flags } = parseArgs(rest);
  const cwd = process.cwd();

  switch (command) {
    case 'build-lib':
      await buildLib({ cwd });
      return 0;

    case 'verify':
      return verify({ cwd });

    case 'gen-api-types': {
      const url = positionals[0];
      if (!url) throw new ShadowScriptsError('Usage: shadow-scripts gen-api-types <url> [--out <path>]');
      const out = flags.out;
      await genApiTypes({
        cwd,
        url,
        outputPath: typeof out === 'string' ? out : undefined,
      });
      return 0;
    }

    case 'release': {
      const bump = positionals[0];
      if (!bump) throw new ShadowScriptsError('Usage: shadow-scripts release <bump> [--path <path>]');
      const targetPath = flags.path;
      await release({
        bump,
        path: typeof targetPath === 'string' ? targetPath : undefined,
      });
      return 0;
    }

    case 'check-migrations': {
      const dir = flags.dir;
      await checkMigrations({
        cwd,
        dir: typeof dir === 'string' ? dir : undefined,
      });
      return 0;
    }

    default:
      throw new ShadowScriptsError(`Unknown command: "${command}"\n\n${HELP_TEXT}`);
  }
}

main()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    if (error instanceof ShadowScriptsError) {
      log.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
