export interface FinalizableDraft {
  isolated: boolean;
  summary?: string | null;
  state?: Record<string, unknown> | null;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

function isEmptyState(state: Record<string, unknown> | null | undefined): boolean {
  return !state || Object.keys(state).length === 0;
}

/**
 * An isolated chapter's own summary and state are what the unrestricted route reads for the next isolated chapter (standard calls read its approved bridge instead), so the gate
 * refuses a null, blank or whitespace-only summary and a `{}` state,
 * all of which render a section indistinguishable from empty. A non-isolated draft is never gated on `state`; every draft's summary is gated in `finalizeRefusals` (`CHP_010`),
 * not here.
 */
export function isFinalizable(draft: FinalizableDraft): boolean {
  if (!draft.isolated) return true;
  return !isBlank(draft.summary) && !isEmptyState(draft.state);
}
