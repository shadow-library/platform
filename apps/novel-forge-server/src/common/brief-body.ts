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
