import fs from 'node:fs';
import path from 'node:path';

import { log, reportError, run, ShadowError } from './utils/index.ts';
import { findWorkspace, MIGRATIONS_DIR, type Workspace } from './workspaces.ts';

type DbCommand = 'generate' | 'migrate' | 'seed';

interface DbCommandOptions {
  name?: string;
}

const USAGE = `Usage: bun scripts/db.ts <workspace> <generate|migrate|seed> [--name=<migration-name>]

  workspace   repo-relative directory (apps/identity-server) or package name
  --name      generate only: the new migration's name instead of drizzle-kit's random one

Centralizes the per-backend Drizzle/Postgres tooling every backend workspace used to duplicate. "generate"
shells drizzle-kit directly with derived schema/out/dialect flags, so no live DB connection or config file
is needed to diff schema against migrations. "migrate" reuses the workspace's own \`shadow.entries\` migration
runner. "seed" runs the workspace's conventional \`tests/fixtures/seed.ts\` entry directly, for workspaces
that have one (a real dev seed, not a template-DB fixture).`;

const COMMANDS: DbCommand[] = ['generate', 'migrate', 'seed'];

const DEFAULT_SCHEMA = 'src/database/schemas/index.ts';

const SEED_ENTRY = 'tests/fixtures/seed.ts';

function resolveSchema(workspace: Workspace): string {
  return workspace.shadow.db?.schema ?? DEFAULT_SCHEMA;
}

function resolveMigrateEntry(workspace: Workspace): string {
  const entry = (workspace.shadow.entries ?? []).find(candidate => /migrate/i.test(candidate));
  if (!entry) throw new ShadowError(`${workspace.dir} has no migration entry in its "shadow.entries" — expected one matching /migrate/i`);
  return entry;
}

// drizzle-kit generate diffs schema against migrations with no DB connection, so it needs neither `--url` nor a config file.
function runGenerate(workspace: Workspace, options: DbCommandOptions): number {
  const schema = resolveSchema(workspace);
  const args = ['drizzle-kit', 'generate', '--schema', schema, '--out', MIGRATIONS_DIR, '--dialect', 'postgresql'];
  if (options.name) args.push('--name', options.name);
  log.info(`drizzle-kit generate — schema ${schema}, out ${MIGRATIONS_DIR}`);
  return run('bunx', args, { cwd: workspace.path }).status;
}

function runMigrate(workspace: Workspace): number {
  const entry = resolveMigrateEntry(workspace);
  log.info(`run    ${entry}`);
  return run('bun', ['run', entry], { cwd: workspace.path }).status;
}

function runSeed(workspace: Workspace): number {
  if (!fs.existsSync(path.join(workspace.path, SEED_ENTRY))) throw new ShadowError(`${workspace.dir} has no ${SEED_ENTRY} — there is nothing to seed`);
  log.info(`run    ${SEED_ENTRY}`);
  return run('bun', ['run', SEED_ENTRY], { cwd: workspace.path }).status;
}

export function runDbCommand(workspace: Workspace, command: DbCommand, options: DbCommandOptions = {}): number {
  if (workspace.type !== 'backend') throw new ShadowError(`${workspace.dir} is not a backend workspace — scripts/db.ts only applies to type: backend`);
  switch (command) {
    case 'generate':
      return runGenerate(workspace, options);
    case 'migrate':
      return runMigrate(workspace);
    case 'seed':
      return runSeed(workspace);
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    log.info(USAGE);
    return 0;
  }

  const [target, command, ...extra] = args.filter(arg => !arg.startsWith('-'));
  if (!target || !command) throw new ShadowError(`A workspace and a command are required.\n\n${USAGE}`);
  if (args.includes('--name')) throw new ShadowError(`--name takes its value after "=", e.g. --name=initial_schema\n\n${USAGE}`);
  if (extra.length > 0) throw new ShadowError(`Unexpected argument "${extra[0]}"\n\n${USAGE}`);
  if (!COMMANDS.includes(command as DbCommand)) throw new ShadowError(`Unknown command "${command}". Expected one of: ${COMMANDS.join(', ')}\n\n${USAGE}`);

  const name = args.find(arg => arg.startsWith('--name='))?.slice('--name='.length);
  if (name !== undefined && command !== 'generate') throw new ShadowError(`--name only applies to "generate"\n\n${USAGE}`);
  if (name === '') throw new ShadowError(`--name needs a value, e.g. --name=initial_schema\n\n${USAGE}`);

  const workspace = findWorkspace(target);
  const status = runDbCommand(workspace, command as DbCommand, { name });
  if (status !== 0) throw new ShadowError(`"${command}" failed for ${workspace.dir} (exit code ${status})`);
  log.success(`${command} ok — ${workspace.dir}`);
  return 0;
}

// Guarded so check-migrations.ts can import `runDbCommand` without re-parsing argv.
if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.exitCode = reportError(error);
  }
}
