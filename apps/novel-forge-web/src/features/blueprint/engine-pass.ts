import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

/**
 * One generation writes the protagonist, the opposition, the world and the ladder, so the four screens share a round. A round
 * started from another screen still runs here, and saying so beats a spinner that looks like this screen is being rewritten.
 */
export function passRunningLabel(round: BlueprintRoundResponse | null, stepKey: string, own: string): string {
  return round?.focus != null && round.focus !== stepKey ? 'Reworking another part of this pass…' : own;
}

/** Round-derived state is rebuilt when the round changes *or* when a pending round becomes ready, never on the id alone. */
export function passRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

/**
 * Cheap structural equality for the small drafts these screens hold: both sides are built by the same code, so their key order matches.
 * It is what tells a field the author owns from one they have only been shown, and so what a new round may replace.
 */
export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function passText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function passList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function passStrings(value: unknown): string[] {
  return passList(value).filter((item): item is string => typeof item === 'string');
}

/** The screen's own locked answer, read back so a revisit locks the whole answer rather than the half still on screen. */
export function lockedDecision(entries: LedgerEntryResponse[], topic: string): LedgerEntryResponse | null {
  return [...entries].reverse().find(entry => entry.kind === 'decision' && entry.topic === topic) ?? null;
}

export function decisionPayload(entry: LedgerEntryResponse | null): Record<string, unknown> {
  return typeof entry?.payload === 'object' && entry.payload !== null ? (entry.payload as Record<string, unknown>) : {};
}
