import { type Generation } from '@server/database';

export interface BatchBrief {
  chapter: number;
  writeMode: Generation.BriefWriteMode;
}

export interface GenerationBatch {
  chapters: number[];
  /** The external-write-mode chapter that truncated the batch below `limit`, when one did. */
  stoppedAtExternalChapter?: number;
  /** The first chapter with neither a draft nor finalized prose that the next planned chapter would have been written over. */
  stoppedAtUnwrittenChapter?: number;
  /** The planned chapter that gap held back. */
  blockedChapter?: number;
}

/**
 * Truncates — never skips — at an unfilled `external` slot: that chapter is filled by hand
 * (`generate-unrestricted` or `drafts/:n/import` + finalize), and drafting past it would write the next
 * chapter against a gap it cannot see, leaving a permanent hole no later run has reason to notice. A batch
 * of 20 with an external slot at chapter 4 therefore yields 3 chapters; that cost is the deliberate trade. Only a finalized `chapters` row releases the stop — an imported draft is
 * not yet canon and its prose can still change under the chapters that would follow it. A chapter is also drafted only once every chapter
 * before it has a draft or finalized prose, so a hole further back — a draft imported ahead of empty chapters — stops the batch too.
 */
export function selectGenerationBatch(briefs: readonly BatchBrief[], started: ReadonlySet<number>, finalized: ReadonlySet<number>, limit: number): GenerationBatch {
  const written = (chapter: number): boolean => started.has(chapter) || finalized.has(chapter);
  let frontier = 0;
  const advance = (): void => {
    while (written(frontier + 1)) frontier++;
  };
  advance();

  const chapters: number[] = [];
  for (const brief of [...briefs].sort((a, b) => a.chapter - b.chapter)) {
    if (chapters.length >= limit) return { chapters };
    if (brief.writeMode === 'external' && !finalized.has(brief.chapter)) return { chapters, stoppedAtExternalChapter: brief.chapter };
    if (written(brief.chapter)) continue;
    if (frontier < brief.chapter - 1) return { chapters, stoppedAtUnwrittenChapter: frontier + 1, blockedChapter: brief.chapter };
    chapters.push(brief.chapter);
    frontier = brief.chapter;
    advance();
  }
  return { chapters };
}
