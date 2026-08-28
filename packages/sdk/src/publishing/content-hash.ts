import { createHash } from 'node:crypto';

export interface ChapterHashInput {
  title: string;
  content: string;
  authorNote?: string | null;
}

// Key order must not affect the hash: a baseline hash is later recomputed from a freshly loaded row,
// where property order is not guaranteed to match the original.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value ?? null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, canonicalize(record[key])]),
  );
}

export function computeContentHash(content: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(content)))
    .digest('hex');
}

// Wire contract between novel-forge-server, web-novel-server and webnovel-ingest: every already-published
// chapter row must keep re-hashing to the same digest, so the field set and the null-for-absent author note
// are frozen — extend the payload only with a versioned hash alongside this one.
export function chapterContentHash({ title, content, authorNote }: ChapterHashInput): string {
  return computeContentHash({ title, content, authorNote: authorNote ?? null });
}
