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
 * The `prepare`-lifecycle setup shadow can own in a consuming repo. `shadow init` wires it as
 * `"prepare": "shadow prepare"` (the same slot husky's own `"prepare": "husky"` used) for a *new*,
 * standalone repo it scaffolds, so it runs on every `bun install`/`npm install` there and readies the
 * configs the ecosystem needs. This platform itself does not use that wiring: the root package.json
 * calls `"prepare": "husky"` directly and no workspace has a `prepare` script at all (see AGENTS.md /
 * the root husky setup) — this function stays reachable only via `shadow init` and the standalone
 * `shadow prepare` subcommand, for repos outside this monorepo. For now the work is husky only —
 * activating git hooks (creating `.husky/_` and pointing `core.hooksPath` at it). It tolerates a
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
