/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { log, reportError, run, ShadowError } from './utils/index.ts';
import { findWorkspace, MIGRATIONS_DIR, type Workspace } from './workspaces.ts';

/**
 * Defining types
 */
type DbCommand = 'generate' | 'migrate' | 'create-template' | 'seed';

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/db.ts <workspace> <generate|migrate|create-template|seed>

  workspace   repo-relative directory (apps/identity-server) or package name

Centralizes the per-backend Drizzle/Postgres tooling every backend workspace used to duplicate as its own
drizzle.config.ts (schema/out/dialect — eliminated; generate now shells drizzle-kit directly with derived
flags, so no live DB connection or config file is needed to diff schema against migrations). "migrate",
"create-template", and "seed" stay backend-owned scripts (their driver choice, seed strategy, and any extra
provisioning step — e.g. novel-forge-server's LangGraph checkpoint tables — genuinely differ per backend and
are not mechanically unifiable without changing runtime behavior); this is a single, convention-driven CLI
surface over them, not a reimplementation.`;

const COMMANDS: DbCommand[] = ['generate', 'migrate', 'create-template', 'seed'];

/** Convention default for a backend's Drizzle schema entry, workspace-relative. Override via `shadow.db.schema`. */
const DEFAULT_SCHEMA = 'src/database/schemas/index.ts';

/** Every backend that has one keeps it at this exact, convention-fixed path — confirmed identical across all 4. */
const CREATE_TEMPLATE_ENTRY = 'scripts/create-template-db.ts';

/** Convention default for a standalone seed entry — only novel-forge-server and pulse-server have one. */
const SEED_ENTRY = 'scripts/seed.ts';

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

function runCreateTemplate(workspace: Workspace): number {
  log.info(`run    ${CREATE_TEMPLATE_ENTRY}`);
  return run('bun', ['run', CREATE_TEMPLATE_ENTRY], { cwd: workspace.path }).status;
}

/**
 * Runs the workspace's standalone seed entry directly at its convention path. Deliberately does NOT consult
 * the workspace's own `db:seed` package.json script — that script now delegates to this very command, so
 * looking it up here would recurse into itself.
 */
function runSeed(workspace: Workspace): number {
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
    case 'create-template':
      return runCreateTemplate(workspace);
    case 'seed':
      return runSeed(workspace);
  }
}

/** Parses argv and runs the requested command against the target workspace. */
function main(): number {
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

try {
  process.exitCode = main();
} catch (error) {
  process.exitCode = reportError(error);
}
