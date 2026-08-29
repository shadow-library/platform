import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { type Chapter } from '@server/database';

/**
 * The complete reader-facing chapter payload — nothing forge-internal may ever be added here (reader-publish
 * design §4, hard rule 7, as amended by interstitial-chapter design §11: a rating level is metadata about the
 * content rather than the content, so it is reader-safe and crosses; nothing else has been readmitted).
 */
export interface ReaderChapterPayload {
  title: string;
  content: string;
  authorNote?: string;
  wordCount: number;
  contentHash: string;
  /** Absent means *unrated* — the reader stores and filters that differently from an explicit `'none'`. */
  contentRating?: ContentRating;
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

/**
 * Renders the reader-clean payload for a canonical chapter row. Only reviewer-approved prose columns
 * are read — state jsonb, summaries, refs, and judge output never cross the boundary. The hash covers
 * exactly the fields the reader stores, so an unchanged payload always re-hashes identically and every
 * republish/no-op decision is deterministic.
 */
export function renderChapterPayload(chapter: Pick<Chapter.Row, 'number' | 'title' | 'content' | 'note' | 'wordCount' | 'contentRating'>): ReaderChapterPayload {
  const title = chapter.title?.trim() || `Chapter ${chapter.number}`;
  const content = (chapter.content ?? '').trim();
  const authorNote = chapter.note?.trim() || undefined;
  const wordCount = chapter.wordCount ?? countWords(content);
  const contentRating = normalizeContentRating(chapter.contentRating);
  const contentHash = chapterContentHash({ title, content, authorNote, contentRating });
  const payload: ReaderChapterPayload = { title, content, wordCount, contentHash };
  if (authorNote) payload.authorNote = authorNote;
  if (contentRating) payload.contentRating = contentRating;
  return payload;
}
