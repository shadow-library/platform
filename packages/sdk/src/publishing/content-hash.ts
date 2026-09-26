import { createHash } from 'node:crypto';

import { type ContentRating, normalizeContentRating } from '../content-rating';

export interface ChapterHashInput {
  title: string;
  content: string;
  authorNote?: string | null;
  contentRating?: ContentRating | null;
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

/**
 * Wire contract between novel-forge-server and web-novel-server: the reader recomputes this
 * digest from the payload it receives and rejects a mismatch, and the forge's ledger decides republish-vs-no-op
 * by comparing it. What governs the field set is therefore not "never change it" — `contentRating` was added
 * after this comment first declared the set frozen, because a rating change
 * must reach readers — but the stricter rule that survived that change: **no edit may move the digest of a
 * chapter whose reader-visible content did not change.** An unrated chapter omits `contentRating` entirely and
 * keeps its historical digest, so only a chapter that actually carries a rating hashes differently; that is what
 * lets the two services ship on different days. Any further field must be additive and absent-by-default under
 * the same rule, or ship as a versioned hash alongside this one. The null-for-absent author note predates the
 * rule and is frozen as-is.
 */
export function chapterContentHash({ title, content, authorNote, contentRating }: ChapterHashInput): string {
  const rating = normalizeContentRating(contentRating);
  const payload: Record<string, unknown> = { title, content, authorNote: authorNote ?? null };
  if (rating) payload.contentRating = rating;
  return computeContentHash(payload);
}

export interface WikiFacetHashInput {
  facetKey: string;
  content: string;
  sortOrder: number;
  visibleFromOrdinal: number;
}

export interface WikiImageHashInput {
  imageRef: string;
  caption?: string | null;
  sortOrder: number;
  visibleFromOrdinal: number;
}

export interface WikiEntryHashInput {
  type: string;
  name: string;
  imageRef?: string | null;
  /** The reader ordinal from which the headline `imageRef` may be shown; absent means it shows whenever the entry does. */
  imageVisibleFromOrdinal?: number | null;
  firstVisibleOrdinal: number;
  facets: WikiFacetHashInput[];
  images: WikiImageHashInput[];
}

/**
 * The reader advertises what its wiki ingest understands on the wiki manifest response, as a comma-separated list in this header. The forge
 * sends a headline gate only to a reader advertising {@link WIKI_HEADLINE_GATE_CAPABILITY}: a reader without it would serve the gated
 * headline to everyone.
 */
export const WIKI_CAPABILITIES_HEADER = 'x-wiki-capabilities';

export const WIKI_HEADLINE_GATE_CAPABILITY = 'headline-gate';

/**
 * The wiki-entry digest the forge's ledger compares to decide republish-vs-no-op, under the same rule as the chapter digest: an absent optional
 * field is omitted rather than hashed as null, so the headline gate moves only the digest of an entry that carries one. A caption is trimmed,
 * and a blank one omitted, exactly as the forge sends it.
 */
export function wikiEntryContentHash({ type, name, imageRef, imageVisibleFromOrdinal, firstVisibleOrdinal, facets, images }: WikiEntryHashInput): string {
  const payload: Record<string, unknown> = {
    type,
    name,
    firstVisibleOrdinal,
    facets,
    images: images.map(({ caption, ...image }) => (caption?.trim() ? { ...image, caption: caption.trim() } : image)),
  };
  if (imageRef) payload.imageRef = imageRef;
  if (imageRef && imageVisibleFromOrdinal !== null && imageVisibleFromOrdinal !== undefined) payload.imageVisibleFromOrdinal = imageVisibleFromOrdinal;
  return computeContentHash(payload);
}
