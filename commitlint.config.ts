/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Commit-message rules for the whole platform, applied by the `commit-msg` hook. Conventional Commits as-is —
 * `AGENTS.md` already mandates the `<type>(<scope>): <subject>` form the shared preset enforces, so there is
 * nothing to add on top. The default export is commitlint's required shape, not a style choice.
 */
export default { extends: ['@commitlint/config-conventional'] };
