import { type Generation } from '@server/database';

export interface BatchBrief {
  chapter: number;
  writeMode: Generation.BriefWriteMode;
}

export interface GenerationBatch {
  chapters: number[];
  /** The external-write-mode chapter that truncated the batch below `limit`, when one did. */
  stoppedAtExternalChapter?: number;
}

/**
 * Truncates — never skips — at an unfilled `external` slot: that chapter is filled by hand
 * (`generate-unrestricted` or `drafts/:n/import` + finalize), and drafting past it would write the next
 * chapter against a gap it cannot see, leaving a permanent hole no later run has reason to notice. A batch
 * of 20 with an external slot at chapter 4 therefore yields 3 chapters; that cost is the deliberate trade
 * (interstitial-chapter-design §8). Only a finalized `chapters` row releases the stop — an imported draft is
 * not yet canon and its prose can still change under the chapters that would follow it.
 */
export function selectGenerationBatch(briefs: readonly BatchBrief[], started: ReadonlySet<number>, finalized: ReadonlySet<number>, limit: number): GenerationBatch {
  const chapters: number[] = [];
  for (const brief of [...briefs].sort((a, b) => a.chapter - b.chapter)) {
    if (chapters.length >= limit) return { chapters };
    if (brief.writeMode === 'external' && !finalized.has(brief.chapter)) return { chapters, stoppedAtExternalChapter: brief.chapter };
    if (!started.has(brief.chapter)) chapters.push(brief.chapter);
  }
  return { chapters };
}
