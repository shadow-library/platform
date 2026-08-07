import './test-idp';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { Logger } from '@shadow-library/common';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');

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
