/**
 * Importing npm packages
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

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
 * command this package spawns while running inside a git hook (e.g. `verify`/`check-migrations` wired
 * into `.husky/pre-commit`) would silently operate on whatever repo invoked the hook instead of `cwd`.
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
