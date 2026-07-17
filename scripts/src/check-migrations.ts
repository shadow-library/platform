/**
 * Importing npm packages
 */
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { ShadowScriptsError, findScript, log, readPackageJson, run } from '@lib/utils';

/**
 * Defining types
 */
export interface CheckMigrationsOptions {
  cwd: string;
  /** Migration output directory, relative to `cwd`. Defaults to the established server convention. */
  dir?: string;
}

/**
 * Declaring the constants
 */
const DEFAULT_MIGRATIONS_DIR = 'generated/drizzle';

/** Resolves `dirArg` relative to `cwd` and rejects anything that escapes the repo (e.g. `--dir ../../etc`). */
export function resolveMigrationsDir(cwd: string, dirArg: string | undefined): string {
  const relative = dirArg ?? DEFAULT_MIGRATIONS_DIR;
  const absolute = path.resolve(cwd, relative);
  if (absolute !== cwd && !absolute.startsWith(cwd + path.sep)) throw new ShadowScriptsError(`--dir must resolve inside the repository, got: ${relative}`);
  return relative;
}

/**
 * Runs the consuming repo's `db:generate` (drizzle-kit or equivalent) and fails if it leaves the
 * migrations directory dirty — a schema change was made without committing the migration it requires.
 * Checks both modified *and* untracked files (`git status --porcelain`, not just `git diff`), since a
 * genuinely new migration is a new file `git diff` alone would never flag.
 */
export async function checkMigrations(options: CheckMigrationsOptions): Promise<void> {
  const { data: packageJson } = readPackageJson(options.cwd);
  const script = findScript(packageJson.scripts, ['db:generate']);
  if (!script) throw new ShadowScriptsError('No "db:generate" script found in package.json — check-migrations requires one to generate migrations from');

  const migrationsDir = resolveMigrationsDir(options.cwd, options.dir);

  log.info(`run    ${script.name} (bun run ${script.name})`);
  const generateResult = run('bun', ['run', script.name], { cwd: options.cwd });
  if (generateResult.status !== 0) throw new ShadowScriptsError(`"${script.name}" failed (exit code ${generateResult.status})`);

  const status = run('git', ['status', '--porcelain', '--', migrationsDir], {
    cwd: options.cwd,
    stream: false,
  });
  if (status.status !== 0) throw new ShadowScriptsError(`Could not check git status for ${migrationsDir} — is this a git repository?`);

  const changedLines = status.stdout.split('\n').filter(line => line.trim() !== '');
  if (changedLines.length === 0) {
    log.success(`No migration drift in ${migrationsDir}`);
    return;
  }

  log.error(`Migration drift detected in ${migrationsDir} — generated migrations are not committed:`);
  const diff = run('git', ['diff', '--', migrationsDir], {
    cwd: options.cwd,
    stream: false,
  });
  if (diff.stdout.trim()) log.error(diff.stdout);
  const untracked = changedLines.filter(line => line.startsWith('??'));
  if (untracked.length > 0) log.error(`Untracked files:\n${untracked.join('\n')}`);

  throw new ShadowScriptsError(`"${script.name}" produced uncommitted changes in ${migrationsDir} — run it locally and commit the result`);
}
