import { sanitizeMarkdown } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

export interface LandedChapter {
  title: string;
  content: string;
  /** Absent on payloads staged before chapters carried their volume. */
  volumeKey?: string;
}

export interface LandChaptersOptions {
  onBatch?: (done: number, total: number) => Promise<void>;
}

const CHAPTER_LANDING_BATCH_SIZE = 25;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Lands a finished manuscript into an empty project as locked, human-authored chapters numbered from 1. */
export async function landFinalChapters(db: PrimaryDatabase, projectId: bigint, chapters: LandedChapter[], options: LandChaptersOptions = {}): Promise<number> {
  const total = chapters.length;

  for (let i = 0; i < total; i += CHAPTER_LANDING_BATCH_SIZE) {
    const batch = chapters.slice(i, i + CHAPTER_LANDING_BATCH_SIZE);
    await options.onBatch?.(i, total);
    await db.insert(schema.chapters).values(
      batch.map((chapter, offset) => ({
        projectId,
        number: 1 + i + offset,
        title: sanitizeMarkdown(chapter.title),
        content: sanitizeMarkdown(chapter.content),
        wordCount: countWords(chapter.content),
        status: 'done' as const,
        generator: 'human' as const,
        locked: true,
        volumeKey: chapter.volumeKey ?? null,
      })),
    );
  }

  await options.onBatch?.(total, total);
  return total;
}
