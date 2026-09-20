import { describe, expect, it } from 'bun:test';

import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(import.meta.dir, '..');

describe('Worker', () => {
  it('should boot the scheduler-only module graph and drain cleanly on SIGTERM', async () => {
    const proc = Bun.spawn(['bun', 'run', 'src/worker.ts'], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, NODE_ENV: 'development', SCHEDULER_TICK_INTERVAL_MS: '50' },
      stdout: 'ignore',
      stderr: 'pipe',
    });

    await new Promise(resolve => setTimeout(resolve, 400));
    expect(proc.exitCode).toBeNull();

    proc.kill('SIGTERM');
    const exitCode = await proc.exited;
    expect(exitCode).toBe(143);
  });
});
