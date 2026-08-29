import { type PrimaryDatabase, schema } from '@server/database';

export interface LandedChapter {
  title?: string | null;
  content: string;
  /** Persisted as `chapters.note`, which the publish payload renders as the reader-facing `authorNote`. */
  note?: string | null;
  /** The chapter's immutable position at its external source; null for anything the forge itself supplies. */
  sourceOrdinal?: number | null;
  /** Digest of the landed prose, supplied only where a caller serves it back later; the forge's own write paths leave it null. */
  contentHash?: string | null;
}

export interface LandChaptersOptions {
  /** `final` lands the finished novel — locked, human-authored, publishable from chapter 1; `source` writes the column defaults. */
  mode?: 'final' | 'source';
  /** `chapters.number` of the first landed chapter; defaults to 1, which lands a whole manuscript into an empty project. */
  startNumber?: number;
  onBatch?: (done: number, total: number) => Promise<void>;
}

export const CHAPTER_LANDING_BATCH_SIZE = 25;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Lands a finished manuscript as chapters numbered contiguously from `startNumber`. Shared by the
 * novel-import executor, the reforge promote stage and the curated-ingest push so all three are
 * indistinguishable afterwards: same statuses, same locking, same numbering, one definition.
 */
export async function landFinalChapters(db: PrimaryDatabase, projectId: bigint, chapters: LandedChapter[], options: LandChaptersOptions = {}): Promise<number> {
  const isFinal = (options.mode ?? 'final') === 'final';
  const startNumber = options.startNumber ?? 1;
  const total = chapters.length;

  for (let i = 0; i < total; i += CHAPTER_LANDING_BATCH_SIZE) {
    const batch = chapters.slice(i, i + CHAPTER_LANDING_BATCH_SIZE);
    await options.onBatch?.(i, total);
    await db.insert(schema.chapters).values(
      batch.map((chapter, offset) => ({
        projectId,
        number: startNumber + i + offset,
        sourceOrdinal: chapter.sourceOrdinal ?? null,
        contentHash: chapter.contentHash ?? null,
        title: chapter.title ?? null,
        content: chapter.content,
        note: chapter.note ?? null,
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
