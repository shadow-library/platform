/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { build } from '@lib/build';
import { checkMigrations } from '@lib/check-migrations';
import { commitMsg } from '@lib/commit-msg';
import { isRepoType, REPO_TYPES, type RepoType } from '@lib/config';
import { genApiTypes } from '@lib/gen-api-types';
import { init } from '@lib/init';
import { release } from '@lib/release';
import { log, ShadowError } from '@lib/utils';
import { verify } from '@lib/verify';

import { parseArgs, type ParsedArgs } from './args';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const HELP_TEXT = `shadow — shared CLI for the Shadow Library ecosystem

Usage:
  shadow init [--type <library|backend|spa|ssr>]
  shadow build [--type <library|backend|spa|ssr>]
  shadow verify [--fix]
  shadow commit-msg <file>
  shadow gen-api-types <url> [--out <path>]
  shadow release <major|minor|patch|alpha|beta> [--force] [--path <path>]
  shadow check-migrations [--dir <path>]

Commands:
  init [--type <t>]      Set up husky hooks + a starter .shadowrc.json (prompts for the repo type; --type skips it)
  build [--type <t>]     Build the current repo per .shadowrc.json by type: library (flat dist), backend (single-file bundle), spa/ssr (vite)
  verify [--fix]         Format + lint the whole repo, then type-check + test
  commit-msg <file>      Lint a commit message (drives the husky commit-msg hook)
  gen-api-types <url>    Fetch an OpenAPI document and generate TypeScript types
  release <type>         Release major|minor|patch (stable, guarded) or alpha|beta (prerelease); libraries only; --force overrides
  check-migrations       Fail if "db:generate" leaves uncommitted migration changes

Configuration lives in .shadowrc.json. See https://github.com/shadow-library/scripts#readme.
`;

/** Validates the optional `--type` flag against the known repo types, so a CI typo fails loudly instead of silently defaulting. */
function parseTypeFlag(flags: ParsedArgs['flags']): RepoType | undefined {
  const value = flags.type;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !isRepoType(value)) throw new ShadowError(`Invalid --type "${String(value)}" — expected one of: ${REPO_TYPES.join(', ')}`);
  return value;
}

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
      await init({ cwd, type: parseTypeFlag(flags) });
      return 0;

    case 'build':
      await build({ cwd, type: parseTypeFlag(flags) });
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
      const releaseType = positionals[0];
      if (!releaseType) throw new ShadowError('Usage: shadow release <major|minor|patch|alpha|beta> [--force] [--path <path>]');
      const targetPath = flags.path;
      await release({ release: releaseType, force: flags.force === true, path: typeof targetPath === 'string' ? targetPath : undefined });
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
