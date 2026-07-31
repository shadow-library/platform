/**
 * Importing user defined packages
 */
import { log, run } from '@lib/utils';

/**
 * Defining types
 */
export interface PrepareOptions {
  /** Root directory of the consuming repo. */
  cwd: string;
}

/**
 * Declaring the constants
 */

/**
 * The `prepare`-lifecycle setup shadow owns in a consuming repo. `shadow init` wires it as
 * `"prepare": "shadow prepare"` (the same slot husky's own `"prepare": "husky"` used), so it runs on
 * every `bun install`/`npm install` and readies the configs the ecosystem needs. For now that is husky
 * only — activating git hooks (creating `.husky/_` and pointing `core.hooksPath` at it). It tolerates a
 * not-yet-initialized git repo so a fresh clone's first install never fails; later config setup will
 * hang off the same command.
 */
export function prepare(options: PrepareOptions): void {
  const result = run('bunx', ['husky'], { cwd: options.cwd, stream: false });
  if (result.status !== 0) {
    log.warn('husky activation skipped (not a git repo yet?) — re-run after "git init"');
    return;
  }
  log.info('husky activated');
}
