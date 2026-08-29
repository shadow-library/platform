export interface FinalizableDraft {
  isolated: boolean;
  summary?: string | null;
  state?: Record<string, unknown> | null;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isEmptyState(state: Record<string, unknown> | null | undefined): boolean {
  return !state || Object.keys(state).length === 0;
}

/**
 * Mirrors exactly what the context assembler's isolated branch renders for the *next* chapter
 * (`context-assembler.service.ts`'s `isIsolated` sections): `Summary: ${prevChapter.summary ?? ''}` and
 * `State: ${prevDraft?.state ? JSON.stringify(prevDraft.state) : 'null'}`. A null/missing summary, a blank
 * or whitespace-only one, and a `{}` state all render a section indistinguishable from empty, so the gate
 * refuses every one of those — not only the null case. Non-isolated drafts are never gated: standard
 * generation always produces a summary as part of its output.
 */
export function isFinalizable(draft: FinalizableDraft): boolean {
  if (!draft.isolated) return true;
  return !isBlank(draft.summary) && !isEmptyState(draft.state);
}
