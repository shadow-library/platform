import { createHash } from 'node:crypto';

import { isRecord } from './catalog.utils';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key])]),
  );
}

/** Independent of key order, so a document that round-trips through jsonb keeps its fingerprint. */
export function catalogFingerprint(document: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(document)))
    .digest('hex');
}
