import { existsSync, readFileSync } from 'node:fs';

/**
 * Bun's `.env` auto-load does not reach Playwright's forked workers; `playwright.config.ts` is re-imported in each, so parsing `.env` here lands the vars before any spec reads
 * them. A var already set (e.g. in CI) wins.
 */

/**
 * Loads `KEY=VALUE` pairs into `process.env`, skipping anything already set. Tolerates a leading `export `, strips an inline comment only after whitespace (`KEY=a#b` stays
 * `a#b`), and keeps a quoted value verbatim.
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
