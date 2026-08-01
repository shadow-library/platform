/**
 * Importing npm packages
 */
import { SQL } from 'bun';
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
type DbCommand = 'generate' | 'migrate' | 'create-template' | 'seed';

/** The base connection string, resolved template DB name, and its full DSN for a workspace's `create-template`. */
interface TemplateTarget {
  baseUrl: string;
  templateDbName: string;
  templateDbUrl: string;
}

/**
 * Declaring the constants
 */
const USAGE = `Usage: bun scripts/db.ts <workspace> <generate|migrate|create-template|seed>

  workspace   repo-relative directory (apps/identity-server) or package name

Centralizes the per-backend Drizzle/Postgres tooling every backend workspace used to duplicate. "generate"
shells drizzle-kit directly with derived schema/out/dialect flags, so no live DB connection or config file
is needed to diff schema against migrations. "migrate" reuses the workspace's own \`shadow.entries\` migration
runner. "create-template" is a single generic driver — drop+create the template DB, run the migrate entry
against it, run the optional template-seed hook, mark it \`IS_TEMPLATE\` — because every backend's actual
migration/seed logic already lives in its own migrate entry and \`tests/fixtures/seed.ts\`; nothing backend-
specific needs to live here anymore. "seed" runs that same conventional seed entry directly.`;

const COMMANDS: DbCommand[] = ['generate', 'migrate', 'create-template', 'seed'];

/** Convention default for a backend's Drizzle schema entry, workspace-relative. Override via `shadow.db.schema`. */
const DEFAULT_SCHEMA = 'src/database/schemas/index.ts';

/** Convention default for a standalone seed entry — only novel-forge-server and pulse-server have one. */
const SEED_ENTRY = 'tests/fixtures/seed.ts';

/** This workspace's Drizzle schema entry: its `shadow.db.schema` override, or the convention default. */
function resolveSchema(workspace: Workspace): string {
  return workspace.shadow.db?.schema ?? DEFAULT_SCHEMA;
}

/**
 * Reads `key` the way a spawned `bun` process in `workspace.path` would see it: an already-set process
 * env var wins (matches dotenv precedence), otherwise its workspace `.env` file is read directly — the
 * parent `scripts/db.ts` process runs from the repo root, so Bun's own automatic `.env` loading (which
 * is relative to *its* cwd) never sees a workspace's `.env`.
 */
function readWorkspaceEnv(workspace: Workspace, key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const envPath = path.join(workspace.path, '.env');
  if (!fs.existsSync(envPath)) return undefined;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${key}=`)) continue;
    return trimmed.slice(key.length + 1).trim();
  }
  return undefined;
}

/** Derives the base connection string + template DB name from the workspace's own DSN, honoring `POSTGRES_TEMPLATE_DB_NAME`. */
function resolveTemplateTarget(workspace: Workspace): TemplateTarget {
  const connectionString = readWorkspaceEnv(workspace, 'DATABASE_POSTGRES_URL');
  if (!connectionString) throw new ShadowError(`${workspace.dir} has no DATABASE_POSTGRES_URL (checked the process env and its .env)`);
  const baseUrl = connectionString.replace(/\/[^/]*$/, '');
  const dbName = connectionString.split('/').pop() as string;
  const templateDbName = readWorkspaceEnv(workspace, 'POSTGRES_TEMPLATE_DB_NAME') ?? `${dbName}_template`;
  return { baseUrl, templateDbName, templateDbUrl: `${baseUrl}/${templateDbName}` };
}

/**
 * The optional per-workspace hook `create-template` runs against the freshly migrated template DB,
 * before marking it `IS_TEMPLATE` — identity-server's `SeedModule` boot (`shadow.db.templateSeed`, a
 * module graph only that workspace can run, so it stays an explicit path) or the conventional
 * `tests/fixtures/seed.ts` (novel-forge-server, pulse-server). A workspace with neither (web-novel-server)
 * skips this step.
 */
function resolveTemplateSeedEntry(workspace: Workspace): string | undefined {
  const configured = workspace.shadow.db?.templateSeed;
  if (configured) return configured;
  return fs.existsSync(path.join(workspace.path, SEED_ENTRY)) ? SEED_ENTRY : undefined;
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
 * Generic `create-template`: drop+create the template DB, run the workspace's own migrate entry against
 * it — the same mechanism `migrate` uses, pointed at the template DSN instead of the app's own — run the
 * optional template-seed hook, then mark it `IS_TEMPLATE`. Replaces four ~85%-identical
 * `apps/*\/scripts/create-template-db.ts` copies: every genuinely per-app step (LangGraph checkpoint
 * tables, the `SeedModule` bootstrap) already lives in that workspace's own migrate entry or template-seed
 * hook, so this driver only needs to sequence them, never reimplement them.
 */
async function runCreateTemplate(workspace: Workspace): Promise<number> {
  const { baseUrl, templateDbName, templateDbUrl } = resolveTemplateTarget(workspace);
  const sql = new SQL(baseUrl, { max: 1 });

  const exists = await sql`SELECT 1 FROM pg_database WHERE datname = ${templateDbName}`.then(rows => rows.length > 0);
  if (exists) {
    await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE false`);
    await sql.unsafe(`DROP DATABASE IF EXISTS ${templateDbName} WITH (FORCE)`);
    log.info(`Database '${templateDbName}' dropped`);
  }
  await sql.unsafe(`CREATE DATABASE ${templateDbName}`);
  log.info(`Database '${templateDbName}' created`);

  // Spawned against the template DSN instead of the workspace's own — its own env var, if set, must not
  // leak through, so this replaces rather than merges with the parent env.
  const templateEnv = { ...process.env, DATABASE_POSTGRES_URL: templateDbUrl };

  const migrateEntry = resolveMigrateEntry(workspace);
  log.info(`run    ${migrateEntry} (against template)`);
  const migrateStatus = run('bun', ['run', migrateEntry], { cwd: workspace.path, env: templateEnv }).status;
  if (migrateStatus !== 0) {
    await sql.close();
    throw new ShadowError(`Migrating the template database failed for ${workspace.dir} (exit code ${migrateStatus})`);
  }

  const seedEntry = resolveTemplateSeedEntry(workspace);
  if (seedEntry) {
    log.info(`run    ${seedEntry} (template seed)`);
    const seedStatus = run('bun', ['run', seedEntry], { cwd: workspace.path, env: templateEnv }).status;
    if (seedStatus !== 0) {
      await sql.close();
      throw new ShadowError(`Seeding the template database failed for ${workspace.dir} (exit code ${seedStatus})`);
    }
  }

  await sql.unsafe(`ALTER DATABASE ${templateDbName} IS_TEMPLATE true`);
  log.info(`Database '${templateDbName}' marked as template`);
  await sql.close();
  return 0;
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
export function runDbCommand(workspace: Workspace, command: DbCommand): number | Promise<number> {
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
  const status = await runDbCommand(workspace, command as DbCommand);
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
