import { type PrimaryDatabase, schema } from '@server/database';

export interface LandedChapter {
  title?: string | null;
  content: string;
}

export interface LandChaptersOptions {
  /** `final` lands the finished novel — locked, human-authored, publishable from chapter 1; `source` writes the column defaults. */
  mode?: 'final' | 'source';
  onBatch?: (done: number, total: number) => Promise<void>;
}

export const CHAPTER_LANDING_BATCH_SIZE = 25;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Lands a finished manuscript as chapters numbered contiguously from 1. Shared by the novel-import
 * executor and the reforge promote stage so a promoted transform is indistinguishable from a
 * `final`-mode import: same statuses, same locking, same numbering, one definition.
 */
export async function landFinalChapters(db: PrimaryDatabase, projectId: bigint, chapters: LandedChapter[], options: LandChaptersOptions = {}): Promise<number> {
  const isFinal = (options.mode ?? 'final') === 'final';
  const total = chapters.length;

  for (let i = 0; i < total; i += CHAPTER_LANDING_BATCH_SIZE) {
    const batch = chapters.slice(i, i + CHAPTER_LANDING_BATCH_SIZE);
    await options.onBatch?.(i, total);
    await db.insert(schema.chapters).values(
      batch.map((chapter, offset) => ({
        projectId,
        number: i + offset + 1,
        title: chapter.title ?? null,
        content: chapter.content,
        wordCount: countWords(chapter.content),
        status: 'done' as const,
        generator: isFinal ? ('human' as const) : ('standard' as const),
        locked: isFinal,
      })),
    );
  }

  await options.onBatch?.(total, total);
  return total;
}
