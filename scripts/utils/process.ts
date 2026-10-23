import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stream?: boolean;
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

// Git sets GIT_DIR and friends inside hooks and they override `cwd` for repo discovery, so a git child spawned from a hook would hit the wrong repo.
export function stripGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
}

// `status` is 1 when killed by a signal (`spawnSync` reports null).
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

// `run` spawns without a shell, so `.bin` is not on PATH; the first dir with the bin wins, letting a workspace-local bin beat the hoisted one.
export function resolveBin(bin: string, dirs: string[]): string {
  for (const dir of dirs) {
    const local = path.join(dir, 'node_modules', '.bin', bin);
    if (fs.existsSync(local)) return local;
  }
  return bin;
}
