import { type ChipIntent } from '@/components/nf/StatusChip';

import { type FactResponse } from './apis/api-types.gen';
import { secretTitle } from './bible-secrets';
import { type UnlockLookup, unlockRows, writerToldLine } from './secret-states';

export type RungFact = Pick<FactResponse, 'factKey' | 'subjects' | 'knowledge' | 'unlock' | 'revealChapter' | 'plannedChapter' | 'disclosedInChapter' | 'writerNote'>;

export type RungState =
  { kind: 'known'; chapter: number; provisional: boolean } | { kind: 'planned'; chapter: number } | { kind: 'locked'; met: number; total: number; dated: number | undefined };

export interface Rung<T extends RungFact> {
  n: number;
  fact: T;
  name: string;
  state: RungState;
  chip: string;
  intent: ChipIntent;
}

const byKey = new Intl.Collator(undefined, { numeric: true });

/** Every fact about the rule, in key order — `rank_2` before `rank_10` — since facts carry no ordinal of their own. */
export function ladderFacts<T extends RungFact>(facts: readonly T[], entityKey: string): T[] {
  return facts.filter(fact => (fact.subjects ?? []).includes(entityKey)).sort((a, b) => byKey.compare(a.factKey, b.factKey));
}

/** "Known since" counts only committed knowledge; a rung known only through unfinalized chapters is marked provisional. */
export function rungState(fact: RungFact, lookup: UnlockLookup): RungState {
  const committed = fact.knowledge.filter(entry => entry.status === 'committed');
  const counted = committed.length > 0 ? committed : fact.knowledge;
  if (counted.length > 0) return { kind: 'known', chapter: Math.min(...counted.map(entry => entry.learnedInChapter)), provisional: committed.length === 0 };
  if (fact.plannedChapter != null) return { kind: 'planned', chapter: fact.plannedChapter };
  const rows = unlockRows(fact, lookup);
  return { kind: 'locked', met: rows.filter(row => row.state === 'reached').length, total: rows.length, dated: fact.revealChapter ?? undefined };
}

function lockedChip(state: Extract<RungState, { kind: 'locked' }>): string {
  if (state.total > 0) return `Locked · ${state.met} of ${state.total} condition${state.total === 1 ? '' : 's'}`;
  return state.dated !== undefined ? `Locked · until ch ${state.dated}` : 'Locked · no unlock set';
}

export function rungChip(state: RungState): { chip: string; intent: ChipIntent } {
  if (state.kind === 'known') return { chip: state.provisional ? `Known from ch ${state.chapter} · provisional` : `Known since ch ${state.chapter}`, intent: 'success' };
  if (state.kind === 'planned') return { chip: `Planned for ch ${state.chapter} · provisional`, intent: 'accent' };
  return { chip: lockedChip(state), intent: 'warning' };
}

export function ladderRungs<T extends RungFact>(facts: readonly T[], lookup: UnlockLookup): Rung<T>[] {
  return facts.map((fact, index) => {
    const state = rungState(fact, lookup);
    return { n: index + 1, fact, name: secretTitle(fact.factKey), state, ...rungChip(state) };
  });
}

/** A character knowing a rung is not the reader seeing it: only a rung a finalized chapter has shown readers may print its truth. */
export function truthShownPlainly(fact: Pick<RungFact, 'disclosedInChapter'>): boolean {
  return fact.disclosedInChapter != null;
}

export function rungLine(fact: RungFact & Pick<FactResponse, 'text'>): string {
  return truthShownPlainly(fact) ? fact.text : writerToldLine(fact);
}

export function unlockSummary(state: RungState): string {
  if (state.kind === 'known') return state.provisional ? `Known from chapter ${state.chapter} — provisional until that chapter is final.` : `Open since chapter ${state.chapter}.`;
  if (state.kind === 'planned') return `Chapter ${state.chapter}’s plan reveals it — provisional until you finalize that chapter. If that plan changes, it goes back to locked.`;
  if (state.total > 1) return 'All must hold, in any order. Opening another rung doesn’t open this one.';
  if (state.total === 1) return 'Opening another rung doesn’t open this one.';
  return state.dated !== undefined ? `No conditions — dated for chapter ${state.dated}.` : 'No conditions and no date — no chapter plan may reveal it.';
}
