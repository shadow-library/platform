/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type CommitConfig } from '@lib/config';

/**
 * Defining types
 */
/** The commitlint `UserConfig` subset we produce — assignable to `@commitlint/load`'s seed. */
export interface CommitlintConfig {
  extends: string[];
  rules: Record<string, unknown>;
}

/**
 * Declaring the constants
 */

/**
 * Builds the commitlint config from the resolved `verify.commit` block — the shipped base
 * (`@commitlint/config-conventional`) plus any repo overrides. Exported so a repo that still wants a
 * `commitlint.config.js` can `export default createCommitlintConfig(loadConfig(process.cwd()).verify.commit)`
 * instead of hand-rolling one.
 */
export function createCommitlintConfig(commit: CommitConfig): CommitlintConfig {
  return { extends: commit.extends, rules: commit.rules };
}
