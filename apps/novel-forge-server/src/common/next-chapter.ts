import { and, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, schema } from '@server/database';

import { firstUnwrittenChapter } from './batch-selection';

type ChapterReader = Pick<DbExecutor, 'query'>;

/** The chapter the author, the chat and generation all write next; a final import without a draft counts as written. */
export async function nextWritableChapter(db: ChapterReader, projectId: bigint): Promise<number> {
  const drafts = await db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), columns: { chapter: true } });
  const finalized = await db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')), columns: { number: true } });
  return firstUnwrittenChapter(new Set(drafts.map(draft => draft.chapter)), new Set(finalized.map(chapter => chapter.number)));
}

/** A new draft starts only at the next writable chapter; a chapter that already has one is edited, never started. */
export async function assertStartsNextChapter(db: ChapterReader, projectId: bigint, chapter: number): Promise<void> {
  const next = await nextWritableChapter(db, projectId);
  if (chapter !== next) throw AppErrorCode.DRF_018.create({ chapter: String(chapter), next: String(next) });
}
