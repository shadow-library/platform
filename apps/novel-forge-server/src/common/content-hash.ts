import { createHash } from 'node:crypto';

import { computeContentHash } from '@shadow-library/sdk/publishing';

export { computeContentHash };

// Deliberately NOT canonicalized: bible_documents rows already store hashes computed with this exact
// fixed-key-order formula, and changing it would spuriously re-version every document on next write.
export function computeBibleDocHash(frontmatter: unknown, body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ frontmatter: frontmatter ?? null, body: body ?? null }))
    .digest('hex');
}

// The field lists below are the hashing contract for proposal baselines: every writer of these rows
// (apply engine, CRUD services, planners) must hash the same fields or conflict detection misfires.
const VOLUME_HASH_FIELDS = ['volumeKey', 'ordinal', 'title', 'objective', 'body'] as const;
const BRIEF_HASH_FIELDS = [
  'chapter',
  'volumeKey',
  'title',
  'body',
  'contextRefs',
  'pov',
  'endingContract',
  'knowledgeContract',
  'chapterPurpose',
  'readerValue',
  'repetitionRisks',
  'guidance',
] as const;

// Fields added after hashes were first stored join the hash only when they differ from their column default, so a stored hash
// stays equal to one recomputed from the same row whether the write omitted the field or spelled out its default.
const VOLUME_DEFAULTED_HASH_FIELDS: Record<string, unknown> = { state: 'not_started' };
const BRIEF_DEFAULTED_HASH_FIELDS: Record<string, unknown> = { direction: null, contentMode: null, scenes: null, claimedMilestones: null, isEnding: false };

function pickAndHash(record: Record<string, unknown>, fields: readonly string[], defaulted: Record<string, unknown>): string {
  const picked: Record<string, unknown> = Object.fromEntries(fields.map(field => [field, record[field] ?? null]));
  for (const [field, fallback] of Object.entries(defaulted)) {
    const value = record[field] ?? fallback;
    if (value !== fallback) picked[field] = value;
  }
  return computeContentHash(picked);
}

export function volumeContentHash(volume: Record<string, unknown>): string {
  return pickAndHash(volume, VOLUME_HASH_FIELDS, VOLUME_DEFAULTED_HASH_FIELDS);
}

export function briefContentHash(brief: Record<string, unknown>): string {
  return pickAndHash(brief, BRIEF_HASH_FIELDS, BRIEF_DEFAULTED_HASH_FIELDS);
}
