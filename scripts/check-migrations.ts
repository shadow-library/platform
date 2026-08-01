/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { runDbCommand } from './db.ts';
import { log, reportError, run, ShadowError } from './utils/index.ts';
import { findWorkspace, MIGRATIONS_DIR, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/check-migrations.ts <workspace>

  workspace   repo-relative directory (apps/identity-server) or package name`;

/**
 * Runs the workspace's `generate` command (`scripts/db.ts`, `drizzle-kit` under the hood) and fails if it
 * leaves the migrations directory dirty — a schema change was made without committing the migration it
 * requires. Checks both modified *and* untracked files (`git status --porcelain`, not just `git diff`),
 * since a genuinely new migration is a new file `git diff` alone would never flag.
 */
export function checkMigrations(workspace: Workspace): void {
  log.info(`run    generate (bun scripts/db.ts ${workspace.dir} generate)`);
  const generateStatus = runDbCommand(workspace, 'generate');
  if (generateStatus !== 0) throw new ShadowError(`"bun scripts/db.ts ${workspace.dir} generate" failed (exit code ${generateStatus})`);

  const status = run('git', ['status', '--porcelain', '--', MIGRATIONS_DIR], { cwd: workspace.path, stream: false });
  if (status.status !== 0) throw new ShadowError(`Could not check git status for ${workspace.dir}/${MIGRATIONS_DIR} — is this a git repository?`);

  const changedLines = status.stdout.split('\n').filter(line => line.trim() !== '');
  if (changedLines.length === 0) {
    log.success(`No migration drift in ${workspace.dir}/${MIGRATIONS_DIR}`);
    return;
  }

  log.error(`Migration drift detected in ${workspace.dir}/${MIGRATIONS_DIR} — generated migrations are not committed:`);
  const diff = run('git', ['diff', '--', MIGRATIONS_DIR], { cwd: workspace.path, stream: false });
  if (diff.stdout.trim()) log.error(diff.stdout);
  const untracked = changedLines.filter(line => line.startsWith('??'));
  if (untracked.length > 0) log.error(`Untracked files:\n${untracked.join('\n')}`);

  throw new ShadowError(`"bun scripts/db.ts ${workspace.dir} generate" produced uncommitted changes — run it locally and commit the result`);
}

/** Parses argv and checks the target workspace for migration drift. */
function main(): number {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const target = args.find(arg => !arg.startsWith('-'));
  if (!target) throw new ShadowError(`A workspace is required.\n\n${USAGE}`);

  checkMigrations(findWorkspace(target));
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.exitCode = reportError(error);
}
