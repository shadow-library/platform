/**
 * Importing npm packages
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Redis } from 'ioredis';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `scripts/db.ts create-template` is root tooling — the one generic implementation of "drop, create,
 * migrate, seed, mark as template" every backend shares — so this workspace's own `bun test` shells
 * out to it rather than duplicating that logic in-process.
 */
const REPO_ROOT = path.resolve(import.meta.dir, '../../..');

/**
 * Flushes the dedicated test Redis DB (see `.env.test` — logical DB 15) once, before any suite
 * runs. Every `TestEnvironment` flushes this same DB in its own `afterAll`, but only for its own
 * suite's teardown; nothing flushes it at the *start* of a whole `bun test` invocation. Without this,
 * a previous run that crashed or was killed before reaching its suites' `afterAll` hooks — or a
 * developer poking `redis-cli -n 15` directly — leaves counters/locks behind that the next run
 * inherits, producing failures that are stable across runs but have nothing to do with the code under
 * test. Flushing only DB 15 (never the developer's own DB 0) keeps this from touching anything a
 * developer is using Redis for locally.
 */
async function flushTestRedisDb(): Promise<void> {
  const url = process.env.DATABASE_REDIS_URL ?? 'redis://localhost:6379/15';
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  await redis.flushdb();
  await redis.quit();
}

/** Builds the migrated, seeded template database every suite clones from, via the root tooling. */
function createTemplateDatabase(): void {
  const result = spawnSync('bun', ['scripts/db.ts', 'apps/identity-server', 'create-template'], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`scripts/db.ts create-template failed (exit code ${result.status})`);
}

/**
 * Preloaded once per test process: flushes stray state from the dedicated test Redis DB, then
 * builds the migrated template database that every suite clones from. Keeps `bun test`
 * self-contained (no external setup step).
 */
Logger.attachTransport('file:json');
await flushTestRedisDb();
createTemplateDatabase();
