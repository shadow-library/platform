/**
 * Importing user defined packages
 */
import { type FormatConfig, loadConfig, PRETTIER_BASE } from '@lib/config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Merges a repo's `verify.format` overrides over the base prettier ruleset — the single place the
 * effective prettier options are computed, shared by `shadow verify` and the shareable config below.
 */
export function mergePrettierConfig(format: FormatConfig = {}): FormatConfig {
  return { ...PRETTIER_BASE, ...format };
}

/**
 * The resolved prettier options for the repo rooted at `cwd` (defaults to the process working
 * directory): the base ruleset merged with the repo's `.shadowrc.json` `verify.format`. A consuming
 * repo's `prettier.config.mjs` (scaffolded by `shadow init`) re-exports this, so a bare `prettier` run
 * — editor format-on-save, `bunx prettier --write` — formats with the exact same options `shadow
 * verify` uses instead of silently falling back to prettier's own defaults (double quotes, 80 columns).
 */
export function getPrettierConfig(cwd: string = process.cwd()): FormatConfig {
  return mergePrettierConfig(loadConfig(cwd).verify.format);
}

/**
 * The base ruleset as a static, zero-IO object — the default export, so a repo with no per-repo
 * `verify.format` overrides can wire the shared config with a single
 * `"prettier": "@shadow-library/scripts/prettier"` package.json key. Repos that do override prettier
 * options use the scaffolded `prettier.config.mjs`, which calls {@link getPrettierConfig} to fold the
 * `.shadowrc.json` overrides in.
 */
export default PRETTIER_BASE;
