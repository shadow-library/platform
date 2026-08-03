/**
 * Importing npm packages
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Playwright's global setup, run once before the suite in the node runner. The specs themselves run under that
 * node runner, where Bun's APIs (`Bun.password.hash`, needed for argon2id) are unavailable — so the seed is
 * spawned as a Bun subprocess instead. `execFileSync` keeps it synchronous: the seed fully completes (and its
 * manifest is written) before any project, including the auth-setup project, starts.
 *
 * Errors propagate deliberately. A seed that cannot reach Postgres is a misconfigured run, and failing here is
 * clearer than letting every authenticated spec fail downstream for want of a seeded user. To run against an
 * environment without seeding, blank the `E2E_PG_URL_*` overrides (the seed skips a blank database).
 */
export default function globalSetup(): void {
  const cwd = path.join(import.meta.dirname, '..');
  execFileSync('bun', ['seed/seed.ts'], { cwd, stdio: 'inherit' });
}
