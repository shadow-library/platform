import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Runs once before the suite in the node runner, which lacks Bun APIs (`Bun.password.hash` for argon2id), so the seed is spawned as a Bun subprocess.
 * `execFileSync` guarantees the seed manifest exists before any project, including auth-setup, starts.
 * Errors propagate: a seed that cannot reach Postgres is a misconfigured run. To skip seeding, blank the `E2E_PG_URL_*` overrides.
 */
export default function globalSetup(): void {
  const cwd = path.join(import.meta.dirname, '..');
  execFileSync('bun', ['seed/seed.ts'], { cwd, stdio: 'inherit' });
}
