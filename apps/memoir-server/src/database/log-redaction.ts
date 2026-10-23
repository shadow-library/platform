import { type Format, format, Logger } from '@shadow-library/common';

import { getSensitivityManifest } from './sensitivity';

const MAX_WILDCARD_DEPTH = 4;

function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/** `fast-redact` paths are static, so each column is redacted at every nesting depth up to `MAX_WILDCARD_DEPTH`, in both its raw `snake_case` and drizzle `camelCase` spelling. */
function redactionPaths(): string[] {
  const columns = new Set(getSensitivityManifest().flatMap(entry => [entry.column, toCamelCase(entry.column)]));
  const paths: string[] = [];
  for (const column of columns) {
    paths.push(column);
    for (let depth = 1; depth <= MAX_WILDCARD_DEPTH; depth++) paths.push(`${'*.'.repeat(depth)}${column}`);
  }
  return paths;
}

/** Redacts every `sensitive()` column by name wherever it appears in log metadata; the paths derive from the manifest at attach time. */
export function manifestLogRedactionFormat(): Format {
  const redactor = Logger.getRedactor(redactionPaths());
  return format(info => {
    redactor(info);
    return info;
  })();
}
