import { computeContentHash } from '@server/common';
import { type Chapter } from '@server/database';

/** The complete reader-facing chapter payload — nothing forge-internal may ever be added here (reader-publish design §4, hard rule 7) */
export interface ReaderChapterPayload {
  title: string;
  content: string;
  authorNote?: string;
  wordCount: number;
  contentHash: string;
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
export function renderChapterPayload(chapter: Pick<Chapter.Row, 'number' | 'title' | 'content' | 'note' | 'wordCount'>): ReaderChapterPayload {
  const title = chapter.title?.trim() || `Chapter ${chapter.number}`;
  const content = (chapter.content ?? '').trim();
  const authorNote = chapter.note?.trim() || undefined;
  const wordCount = chapter.wordCount ?? countWords(content);
  const contentHash = computeContentHash({ title, content, authorNote: authorNote ?? null });
  const payload: ReaderChapterPayload = { title, content, wordCount, contentHash };
  if (authorNote) payload.authorNote = authorNote;
  return payload;
}
