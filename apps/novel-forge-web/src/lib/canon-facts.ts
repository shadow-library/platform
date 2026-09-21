import { type FactResponse } from '@/lib/apis';

export interface CanonFact {
  id: string;
  factKey: string;
  subjects?: string[] | null;
  terms?: string[] | null;
  constraintNote?: string | null;
  writerNote?: string | null;
  revealChapter?: number | null;
  knowledge: { entityKey: string; learnedInChapter?: number }[];
}

export type FactState = 'hidden' | 'revealed';

export type FactCategory = FactState | 'all';

export type FactAttachment = { kind: 'linked'; entityKey: string; name: string } | { kind: 'missing'; entityKey: string };

export function factState(fact: Pick<CanonFact, 'knowledge'>): FactState {
  return fact.knowledge.length > 0 ? 'revealed' : 'hidden';
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

export function factAttachments(fact: Pick<CanonFact, 'subjects'>, names: ReadonlyMap<string, string>): FactAttachment[] {
  return (fact.subjects ?? []).map(entityKey => {
    const name = names.get(entityKey);
    return name === undefined ? { kind: 'missing', entityKey } : { kind: 'linked', entityKey, name };
  });
}

export type FactReveal = { kind: 'revealed'; chapter: number | undefined } | { kind: 'planned'; chapter: number } | { kind: 'unscheduled' };

/** `revealChapter` is an authoring aid, never truth — a fact only counts as revealed once the ledger (`knowledge`) says so. */
export function factReveal(fact: Pick<CanonFact, 'knowledge' | 'revealChapter'>): FactReveal {
  if (fact.knowledge.length > 0) {
    const chapters = fact.knowledge.map(entry => entry.learnedInChapter).filter((chapter): chapter is number => chapter != null);
    return { kind: 'revealed', chapter: chapters.length > 0 ? Math.min(...chapters) : undefined };
  }
  if (fact.revealChapter != null) return { kind: 'planned', chapter: fact.revealChapter };
  return { kind: 'unscheduled' };
}

/** The only trace of a hidden fact the chapter writer sees — an empty note withholds it from drafting context entirely. */
export function factHiddenFromWriter(fact: Pick<CanonFact, 'knowledge' | 'writerNote'>): boolean {
  return factState(fact) === 'hidden' && !(fact.writerNote ?? '').trim();
}

/** A chapter number typed by the author: a whole number from 1, or nothing. */
export function parseChapter(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const chapter = Number(trimmed);
  return chapter >= 1 ? chapter : undefined;
}

export function listToText(values?: string[] | null): string {
  return (values ?? []).join(', ');
}

export function textToList(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export interface FactFormState {
  factKey: string;
  text: string;
  subjects: string;
  constraintNote: string;
  writerNote: string;
  terms: string;
  revealChapter: string;
}

export function emptyFactForm(): FactFormState {
  return { factKey: '', text: '', subjects: '', constraintNote: '', writerNote: '', terms: '', revealChapter: '' };
}

export function factFormFromFact(fact: FactResponse): FactFormState {
  return {
    factKey: fact.factKey,
    text: fact.text,
    subjects: listToText(fact.subjects),
    constraintNote: fact.constraintNote ?? '',
    writerNote: fact.writerNote ?? '',
    terms: listToText(fact.terms),
    revealChapter: fact.revealChapter != null ? String(fact.revealChapter) : '',
  };
}
