import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { type Chapter } from '@server/database';

/** The complete reader-facing chapter payload; a rating level is the one non-prose field that crosses. */
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

/** Reader-clean payload from reviewer-approved prose columns only; the hash covers exactly the fields the reader stores. */
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
