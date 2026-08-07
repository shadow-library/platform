import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Redis } from 'ioredis';
import { Logger } from '@shadow-library/common';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');

/** A crashed run can leave counters and locks in the dedicated test Redis DB, so clear it before any suite starts. */
async function flushTestRedisDb(): Promise<void> {
  const url = process.env.DATABASE_REDIS_URL ?? 'redis://localhost:6379/15';
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  await redis.flushdb();
  await redis.quit();
}

function createTemplateDatabase(): void {
  const result = spawnSync('bun', ['scripts/db.ts', 'apps/identity-server', 'create-template'], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`scripts/db.ts create-template failed (exit code ${result.status})`);
}

Logger.attachTransport('file:json');
await flushTestRedisDb();
createTemplateDatabase();
