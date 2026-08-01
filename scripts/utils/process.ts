/**
 * Importing npm packages
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Set to false to capture stdout/stderr instead of streaming to the parent terminal. Defaults to true. */
  stream?: boolean;
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Declaring the constants
 */

/**
 * Strips `GIT_*` variables (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, …) from `env`. Git sets these
 * when invoking hooks, and they take precedence over `cwd` for repo discovery — without this, any `git`
 * command spawned while running inside a git hook (e.g. `verify`/`check-migrations` wired into
 * `.husky/pre-commit`) would silently operate on whatever repo invoked the hook instead of `cwd`.
 */
export function stripGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
}

/**
 * Spawns `command` with structured `args` — never a shell string — so paths and user-controlled
 * values can never be interpreted as shell syntax. `status` is normalized to 1 when the process was
 * killed by a signal or failed to spawn (`spawnSync` reports both as `status: null`).
 */
export function run(command: string, args: string[], options: RunOptions): RunResult {
  const stream = options.stream ?? true;
  const spawnOptions: SpawnSyncOptions = {
    cwd: options.cwd,
    env: stripGitEnv(options.env ?? process.env),
    stdio: stream ? 'inherit' : 'pipe',
    encoding: 'utf-8',
  };

  const result = spawnSync(command, args, spawnOptions);
  if (result.error) throw result.error;

  return {
    status: result.status ?? 1,
    stdout: stream ? '' : (result.stdout?.toString() ?? ''),
    stderr: stream ? '' : (result.stderr?.toString() ?? ''),
  };
}

/**
 * The asynchronous counterpart to {@link run}, always capturing output — the only way to have several
 * commands genuinely in flight at once, which `build --all` needs to build a dependency level in parallel.
 */
export async function runAsync(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: stripGitEnv(options.env ?? process.env),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { status, stdout, stderr };
}

/**
 * Resolves a command's leading token to a `node_modules/.bin/<bin>` under one of `dirs` (first match
 * wins, so a workspace-local bin beats the hoisted root one) — a bare command like `"vite build"` must
 * still find the installed bundler even though {@link run} spawns without a shell, so `.bin` is not on
 * PATH. A token that isn't a local bin (`bun`, `node`, an absolute path) is left for PATH to resolve.
 */
export function resolveBin(bin: string, dirs: string[]): string {
  for (const dir of dirs) {
    const local = path.join(dir, 'node_modules', '.bin', bin);
    if (fs.existsSync(local)) return local;
  }
  return bin;
}
