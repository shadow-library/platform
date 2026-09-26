import { type BriefScene } from '@server/database';

export interface ChapterPovBrief {
  pov: string | null;
  scenes: BriefScene[] | null;
}

/** The chapter's point of view for display: the brief's own pov, or the first pooled scene pov. */
export function resolveChapterPov(brief: ChapterPovBrief | undefined | null): string | null {
  if (!brief) return null;
  if (brief.pov) return brief.pov;
  return brief.scenes?.find(scene => scene.pov)?.pov ?? null;
}

/** Whether a brief counts as this point of view for filtering — its own pov, or any pooled scene pov. */
export function briefMatchesPov(brief: ChapterPovBrief, pov: string): boolean {
  return brief.pov === pov || (brief.scenes ?? []).some(scene => scene.pov === pov);
}
