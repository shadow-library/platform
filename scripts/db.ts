/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */
import { log, reportError, run, ShadowError } from './utils/index.ts';
import { findWorkspace, MIGRATIONS_DIR, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */
type DbCommand = 'generate' | 'migrate' | 'seed';

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/db.ts <workspace> <generate|migrate|seed>

  workspace   repo-relative directory (apps/identity-server) or package name

Centralizes the per-backend Drizzle/Postgres tooling every backend workspace used to duplicate. "generate"
shells drizzle-kit directly with derived schema/out/dialect flags, so no live DB connection or config file
is needed to diff schema against migrations. "migrate" reuses the workspace's own \`shadow.entries\` migration
runner. "seed" runs the workspace's conventional \`tests/fixtures/seed.ts\` entry directly, for workspaces
that have one (a real dev seed, not a template-DB fixture).`;

const COMMANDS: DbCommand[] = ['generate', 'migrate', 'seed'];

/** Convention default for a backend's Drizzle schema entry, workspace-relative. Override via `shadow.db.schema`. */
const DEFAULT_SCHEMA = 'src/database/schemas/index.ts';

/** Convention default for a standalone seed entry — only workspaces with a real dev seed have one. */
const SEED_ENTRY = 'tests/fixtures/seed.ts';

/** This workspace's Drizzle schema entry: its `shadow.db.schema` override, or the convention default. */
function resolveSchema(workspace: Workspace): string {
  return workspace.shadow.db?.schema ?? DEFAULT_SCHEMA;
}

/**
 * This workspace's migration entrypoint. Every backend already declares its prod migration runner in
 * `shadow.entries` (bundled standalone alongside `src/main.ts`) — `scripts/db.ts` reuses that declaration
 * instead of inventing a second, possibly-drifting convention for the same file.
 */
function resolveMigrateEntry(workspace: Workspace): string {
  const entry = (workspace.shadow.entries ?? []).find(candidate => /migrate/i.test(candidate));
  if (!entry) throw new ShadowError(`${workspace.dir} has no migration entry in its "shadow.entries" — expected one matching /migrate/i`);
  return entry;
}

/** `drizzle-kit generate` needs only schema/out/dialect to diff — no live DB connection, so no `--url` and no config file. */
function runGenerate(workspace: Workspace): number {
  const schema = resolveSchema(workspace);
  log.info(`drizzle-kit generate — schema ${schema}, out ${MIGRATIONS_DIR}`);
  return run('bunx', ['drizzle-kit', 'generate', '--schema', schema, '--out', MIGRATIONS_DIR, '--dialect', 'postgresql'], { cwd: workspace.path }).status;
}

function runMigrate(workspace: Workspace): number {
  const entry = resolveMigrateEntry(workspace);
  log.info(`run    ${entry}`);
  return run('bun', ['run', entry], { cwd: workspace.path }).status;
}

/**
 * Runs the workspace's standalone seed entry directly at its convention path. Deliberately does NOT consult
 * the workspace's own `db:seed` package.json script — that script now delegates to this very command, so
 * looking it up here would recurse into itself.
 */
function runSeed(workspace: Workspace): number {
  if (!fs.existsSync(path.join(workspace.path, SEED_ENTRY))) throw new ShadowError(`${workspace.dir} has no ${SEED_ENTRY} — there is nothing to seed`);
  log.info(`run    ${SEED_ENTRY}`);
  return run('bun', ['run', SEED_ENTRY], { cwd: workspace.path }).status;
}

/** Dispatches `command` for `workspace`, returning the child process's exit status. */
export function runDbCommand(workspace: Workspace, command: DbCommand): number {
  if (workspace.type !== 'backend') throw new ShadowError(`${workspace.dir} is not a backend workspace — scripts/db.ts only applies to type: backend`);
  switch (command) {
    case 'generate':
      return runGenerate(workspace);
    case 'migrate':
      return runMigrate(workspace);
    case 'seed':
      return runSeed(workspace);
  }
}

/** Parses argv and runs the requested command against the target workspace. */
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const [target, command] = args.filter(arg => !arg.startsWith('-'));
  if (!target || !command) throw new ShadowError(`A workspace and a command are required.\n\n${USAGE}`);
  if (!COMMANDS.includes(command as DbCommand)) throw new ShadowError(`Unknown command "${command}". Expected one of: ${COMMANDS.join(', ')}\n\n${USAGE}`);

  const workspace = findWorkspace(target);
  const status = runDbCommand(workspace, command as DbCommand);
  if (status !== 0) throw new ShadowError(`"${command}" failed for ${workspace.dir} (exit code ${status})`);
  log.success(`${command} ok — ${workspace.dir}`);
  return 0;
}

// Guarded so importing `runDbCommand` (e.g. from check-migrations.ts) doesn't also re-parse argv and
// print this file's own --help/USAGE as a side effect of the import.
if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.exitCode = reportError(error);
  }
}
