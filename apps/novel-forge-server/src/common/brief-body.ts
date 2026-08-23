export interface BriefBodyInput {
  objective: string;
  events: string[];
  continuesIntoNextChapter?: boolean;
  startsFromPreviousChapter?: boolean;
  handoffBeat?: string;
}

// Folds outline-time continuation decisions into the stored brief body so the drafter — which only
// ever reads `chapterBrief` as plain text — actually sees them. Shared by the outline flow and the
// plan-import endpoint so an authored brief renders byte-identically to an AI-outlined one.
export function renderBriefBody(c: BriefBodyInput): string {
  const lines = [c.objective, ...(c.events ?? [])];
  if (c.continuesIntoNextChapter) lines.push("[CONTINUES INTO NEXT CHAPTER] Do not resolve this chapter's central action/tension.");
  if (c.startsFromPreviousChapter)
    lines.push(
      "[STARTS FROM PREVIOUS CHAPTER] Continue forward in new sentences from the exact beat the previous chapter handed off — no time skip, no recap, and never repeat the previous chapter's closing line(s) verbatim; the reader already read them.",
    );
  if (c.handoffBeat) lines.push(`Handoff beat: ${c.handoffBeat}`);
  return lines.join('\n');
}

export interface ChapterBriefInput {
  body?: string | null;
  chapterPurpose?: string | null;
  readerValue?: unknown;
  repetitionRisks?: unknown;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim());
}

// The single authority for the `chapterBrief` prompt variable. Briefs written before the outliner
// authored these fields — and every imported plan — carry them as null, and must render byte-identically
// to the stored body alone.
export function renderChapterBrief(brief: ChapterBriefInput | null | undefined): string {
  const body = brief?.body ?? '';
  const guidance: string[] = [];
  const purpose = brief?.chapterPurpose?.trim();
  const readerValue = stringList(brief?.readerValue);
  const repetitionRisks = stringList(brief?.repetitionRisks);
  if (purpose) guidance.push(`Chapter purpose: ${purpose}`);
  if (readerValue.length > 0) guidance.push(`This chapter must deliver: ${readerValue.join(', ')}`);
  if (repetitionRisks.length > 0) guidance.push(`Avoid repeating recent patterns: ${repetitionRisks.join('; ')}`);
  if (guidance.length === 0) return body;
  return body ? `${body}\n\n${guidance.join('\n')}` : guidance.join('\n');
}
