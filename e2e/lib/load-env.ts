/**
 * Importing npm packages
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Bun auto-loads `.env` for a directly-invoked `bun`/`bunx` process, but that loading does not reach
 * Playwright's forked worker processes (verified empirically — a worker's `process.env` lacks vars that
 * are present in the process that started `bunx playwright test`). `playwright.config.ts` is re-imported
 * in every worker, though, so parsing `.env` here — a plain `KEY=VALUE` reader, no `dotenv` dependency —
 * runs in each one and reliably lands the vars before any spec reads them. An already-set var (a real
 * environment variable, e.g. in CI) always wins over the file.
 */

/** Loads `KEY=VALUE` pairs from `path` into `process.env`, skipping blanks/comments and anything already set. */
export function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const isQuoted = (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"));
    const value = isQuoted ? rawValue.slice(1, -1) : rawValue;

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
