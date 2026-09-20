import { type Format, format, Logger } from '@shadow-library/common';

import { getSensitivityManifest } from './sensitivity';

const MAX_WILDCARD_DEPTH = 4;

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * `fast-redact` paths are static, so each column name is redacted at every nesting depth up to
 * `MAX_WILDCARD_DEPTH`, rather than by structural knowledge of the log call site — under both its raw
 * DB (`snake_case`) spelling and its drizzle model (`camelCase`) spelling, since a log call may carry
 * either shape depending on whether it logged a raw row or an app-level object.
 */
function redactionPaths(): string[] {
  const columns = new Set(getSensitivityManifest().flatMap(entry => [entry.column, toCamelCase(entry.column)]));
  const paths: string[] = [];
  for (const column of columns) {
    paths.push(column);
    for (let depth = 1; depth <= MAX_WILDCARD_DEPTH; depth++) paths.push(`${'*.'.repeat(depth)}${column}`);
  }
  return paths;
}

/**
 * Defense-in-depth for ARCHITECTURE §24: redacts every `sensitive()`-wrapped column by name, wherever it
 * surfaces in a log call's metadata, regardless of which module logged it. New `sensitive()` columns join
 * automatically because the paths are derived from the manifest at attach time, not hand-maintained.
 */
export function manifestLogRedactionFormat(): Format {
  const redactor = Logger.getRedactor(redactionPaths());
  return format(info => {
    redactor(info);
    return info;
  })();
}
