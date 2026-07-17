/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { build } from '@lib/build';
import { checkMigrations } from '@lib/check-migrations';
import { commitMsg } from '@lib/commit-msg';
import { genApiTypes } from '@lib/gen-api-types';
import { init } from '@lib/init';
import { release } from '@lib/release';
import { log, ShadowError } from '@lib/utils';
import { verify } from '@lib/verify';

import { parseArgs } from './args';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const HELP_TEXT = `shadow — shared CLI for the Shadow Library ecosystem

Usage:
  shadow init
  shadow build
  shadow verify [--fix]
  shadow commit-msg <file>
  shadow gen-api-types <url> [--out <path>]
  shadow release <stable|alpha|beta> [--path <path>]
  shadow check-migrations [--dir <path>]

Commands:
  init                   Set up husky hooks + a starter .shadowrc.json for this repo
  build                  Build the current repo per .shadowrc.json (ESM-only, flat dist)
  verify [--fix]         Format + lint the whole repo, then type-check + test
  commit-msg <file>      Lint a commit message (drives the husky commit-msg hook)
  gen-api-types <url>    Fetch an OpenAPI document and generate TypeScript types
  release <channel>      Auto-bump from commits and publish; channel is stable | alpha | beta
  check-migrations       Fail if "db:generate" leaves uncommitted migration changes

Configuration lives in .shadowrc.json. See https://github.com/shadow-library/scripts#readme.
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
    case 'init':
      await init({ cwd });
      return 0;

    case 'build':
      await build({ cwd });
      return 0;

    case 'verify':
      return verify({ cwd, fix: flags.fix === true });

    case 'commit-msg':
      return commitMsg({ cwd, file: positionals[0] ?? '' });

    case 'gen-api-types': {
      const url = positionals[0];
      if (!url) throw new ShadowError('Usage: shadow gen-api-types <url> [--out <path>]');
      const out = flags.out;
      await genApiTypes({ cwd, url, outputPath: typeof out === 'string' ? out : undefined });
      return 0;
    }

    case 'release': {
      const channel = positionals[0];
      if (!channel) throw new ShadowError('Usage: shadow release <stable|alpha|beta> [--path <path>]');
      const targetPath = flags.path;
      await release({ channel, path: typeof targetPath === 'string' ? targetPath : undefined });
      return 0;
    }

    case 'check-migrations': {
      const dir = flags.dir;
      await checkMigrations({ cwd, dir: typeof dir === 'string' ? dir : undefined });
      return 0;
    }

    default:
      throw new ShadowError(`Unknown command: "${command}"\n\n${HELP_TEXT}`);
  }
}

main()
  .then(exitCode => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    if (error instanceof ShadowError) {
      log.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }
    log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
