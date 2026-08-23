import { describe, expect, it } from 'bun:test';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(import.meta.dir, '..');

describe('Worker', () => {
  it('should boot and exit cleanly with no scheduled work registered', () => {
    const result = spawnSync('bun', ['run', 'src/worker.ts'], { cwd: WORKSPACE_ROOT, encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });
});
