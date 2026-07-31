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
 * The canonical prettier ruleset for the ecosystem. `shadow init` writes it to a repo's
 * `.prettierrc.json` — the single, standard place both prettier itself and `shadow verify` (which
 * resolves the file rather than carrying its own copy) read formatting options from. It is never applied
 * programmatically at format time: once written, the `.prettierrc.json` file is the source of truth, so
 * an editor's format-on-save and a bare `prettier` run match `shadow verify` exactly.
 */
export const PRETTIER_CONFIG = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 180,
  arrowParens: 'avoid',
} as const;

/** The `.prettierrc.json` file body (pretty-printed JSON, trailing newline) `shadow init` writes into a repo. */
export function renderPrettierConfig(): string {
  return `${JSON.stringify(PRETTIER_CONFIG, null, 2)}\n`;
}
