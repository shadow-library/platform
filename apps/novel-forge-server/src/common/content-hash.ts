/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Key order must not affect the hash: proposals capture a baseline hash that is later recomputed
// from a freshly loaded row, where property order is not guaranteed to match the original.
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

// Deliberately NOT canonicalized: bible_documents rows already store hashes computed with this exact
// fixed-key-order formula, and changing it would spuriously re-version every document on next write.
export function computeBibleDocHash(frontmatter: unknown, body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ frontmatter: frontmatter ?? null, body: body ?? null }))
    .digest('hex');
}

// The field lists below are the hashing contract for proposal baselines: every writer of these rows
// (apply engine, CRUD services, planners) must hash the same fields or conflict detection misfires.
const VOLUME_HASH_FIELDS = ['volumeKey', 'ordinal', 'title', 'objective', 'conflict', 'payoff', 'targetChapterCount', 'cast', 'body', 'startChapter', 'endChapter'] as const;
const ARC_HASH_FIELDS = ['arcKey', 'volumeKey', 'ordinal', 'title', 'objective', 'escalation', 'payoff', 'hook', 'chapterStart', 'chapterEnd', 'cast', 'body'] as const;
const BRIEF_HASH_FIELDS = ['chapter', 'volumeKey', 'arcKey', 'title', 'body', 'contextRefs', 'endingContract'] as const;

function pickAndHash(record: Record<string, unknown>, fields: readonly string[]): string {
  return computeContentHash(Object.fromEntries(fields.map(field => [field, record[field] ?? null])));
}

export function volumeContentHash(volume: Record<string, unknown>): string {
  return pickAndHash(volume, VOLUME_HASH_FIELDS);
}

export function arcContentHash(arc: Record<string, unknown>): string {
  return pickAndHash(arc, ARC_HASH_FIELDS);
}

export function briefContentHash(brief: Record<string, unknown>): string {
  return pickAndHash(brief, BRIEF_HASH_FIELDS);
}
