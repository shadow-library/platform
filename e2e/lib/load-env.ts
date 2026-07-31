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

/**
 * Loads `KEY=VALUE` pairs from `path` into `process.env`, skipping blanks/comments and anything already
 * set. Tolerates a leading `export ` (copy-pasting a shell snippet shouldn't break parsing) and strips an
 * unquoted inline comment (`KEY=1 # note` → `1`, not `1 # note` — a `#` only starts a comment when it's
 * preceded by whitespace or opens the value outright, so `KEY=a#b` stays `a#b`). A quoted value
 * (`KEY="a # b"`) is kept verbatim, `#` included.
 */
export function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;

    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    const rawValue = withoutExport.slice(separatorIndex + 1).trim();
    const isQuoted = (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) || (rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2);

    let value: string;
    if (isQuoted) {
      value = rawValue.slice(1, -1);
    } else {
      const commentIndex = rawValue.search(/(?:^|\s)#/);
      value = (commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex)).trim();
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
