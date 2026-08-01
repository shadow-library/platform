/**
 * Importing packages with side effects
 */
import './test-idp';

/**
 * Importing npm packages
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
 * migrate, mark as template" every backend shares — so this workspace's own `bun test` shells out to
 * it rather than duplicating that logic in-process.
 */
const REPO_ROOT = path.resolve(import.meta.dir, '../../..');

/** Builds the migrated template database every suite clones from, via the root tooling. */
function createTemplateDatabase(): void {
  const result = spawnSync('bun', ['scripts/db.ts', 'apps/web-novel-server', 'create-template'], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`scripts/db.ts create-template failed (exit code ${result.status})`);
}

/**
 * Preloaded once per test process: boots the mock identity provider (side-effect import above)
 * and builds the migrated template database every suite clones from. Keeps `bun test`
 * self-contained — no external setup step.
 */
Logger.attachTransport('file:json');
createTemplateDatabase();
