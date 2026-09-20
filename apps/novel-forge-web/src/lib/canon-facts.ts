export interface CanonFact {
  id: string;
  factKey: string;
  subjects?: string[] | null;
  terms?: string[] | null;
  constraintNote?: string | null;
  revealChapter?: number | null;
  knowledge: { entityKey: string }[];
}

export type FactState = 'hidden' | 'revealed';

export type FactCategory = FactState | 'all';

export type SpoilerState = 'concealed' | 'shown';

export type FactAttachment = { kind: 'linked'; entityKey: string; name: string } | { kind: 'missing'; entityKey: string };

export const FACT_STATES: FactState[] = ['hidden', 'revealed'];

export const STATE_LABEL: Record<FactCategory, string> = {
  all: 'All',
  hidden: 'Hidden',
  revealed: 'Revealed',
};

export function factState(fact: Pick<CanonFact, 'knowledge'>): FactState {
  return fact.knowledge.length > 0 ? 'revealed' : 'hidden';
}

export function parseFactState(value: unknown): FactState | undefined {
  return FACT_STATES.find(state => state === value);
}

export function countByState(facts: readonly CanonFact[]): Record<FactState, number> {
  const counts: Record<FactState, number> = { hidden: 0, revealed: 0 };
  for (const fact of facts) counts[factState(fact)] += 1;
  return counts;
}

export function sortFactsByKey<T extends CanonFact>(facts: readonly T[]): T[] {
  return [...facts].sort((a, b) => a.factKey.localeCompare(b.factKey));
}

/** The truth text is deliberately not searched: typing a word and watching a key appear would leak the spoiler the page exists to withhold. */
function matchesQuery(fact: CanonFact, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [fact.factKey, ...(fact.subjects ?? []), ...(fact.terms ?? [])].join(' ').toLowerCase().includes(needle);
}

export function filterFacts<T extends CanonFact>(facts: readonly T[], category: FactCategory, query: string): T[] {
  return facts.filter(fact => (category === 'all' || factState(fact) === category) && matchesQuery(fact, query));
}

export function factCaption(fact: Pick<CanonFact, 'knowledge'>): string {
  const known = fact.knowledge.length;
  if (known === 0) return 'hidden';
  return `revealed to ${known} character${known === 1 ? '' : 's'}`;
}

export function backLabel(total: number | undefined): string {
  return total === undefined ? 'All facts' : `All ${total} fact${total === 1 ? '' : 's'}`;
}

export function factAttachments(fact: Pick<CanonFact, 'subjects'>, names: ReadonlyMap<string, string>): FactAttachment[] {
  return (fact.subjects ?? []).map(entityKey => {
    const name = names.get(entityKey);
    return name === undefined ? { kind: 'missing', entityKey } : { kind: 'linked', entityKey, name };
  });
}

/** A hidden fact opens concealed; a fact a character already knows has nothing left to spoil, so it opens readable. */
export function initialSpoilerState(state: FactState): SpoilerState {
  return state === 'revealed' ? 'shown' : 'concealed';
}

export function spoilerToggleLabel(state: SpoilerState, factKey: string): string {
  return state === 'shown' ? `Hide the judge-only truth of ${factKey}` : `Reveal the judge-only truth of ${factKey}`;
}
