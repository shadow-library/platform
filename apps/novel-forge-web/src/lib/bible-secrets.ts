import { type CanonFact, factReveal, factState } from './canon-facts';

/** A secret is a fact no character has learned yet; the ledger, not the planned chapter, is what reveals it. */
export function isSecret(fact: Pick<CanonFact, 'knowledge'>): boolean {
  return factState(fact) === 'hidden';
}

export function secretsAbout<T extends CanonFact>(facts: readonly T[], entityKey: string): T[] {
  return sortSecrets(facts.filter(fact => isSecret(fact) && (fact.subjects ?? []).includes(entityKey)));
}

export function knownFactsAbout<T extends CanonFact>(facts: readonly T[], entityKey: string): T[] {
  return facts.filter(fact => !isSecret(fact) && (fact.subjects ?? []).includes(entityKey)).sort((a, b) => a.factKey.localeCompare(b.factKey));
}

export function secretCountsBySubject(facts: readonly CanonFact[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fact of facts) {
    if (!isSecret(fact)) continue;
    for (const subject of new Set(fact.subjects ?? [])) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  return counts;
}

/** Soonest reveal first; a secret with no planned chapter sorts last, and ties fall back to the key so the order never shuffles. */
export function sortSecrets<T extends CanonFact>(facts: readonly T[]): T[] {
  const chapter = (fact: CanonFact): number => fact.revealChapter ?? Number.POSITIVE_INFINITY;
  return [...facts].sort((a, b) => chapter(a) - chapter(b) || a.factKey.localeCompare(b.factKey));
}

export interface SecretGroups<T> {
  planned: T[];
  unplanned: T[];
}

export function groupSecrets<T extends CanonFact>(facts: readonly T[]): SecretGroups<T> {
  const secrets = sortSecrets(facts.filter(isSecret));
  return { planned: secrets.filter(fact => fact.revealChapter != null), unplanned: secrets.filter(fact => fact.revealChapter == null) };
}

export function secretTitle(factKey: string): string {
  const words = factKey
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : factKey;
}

export function secretRevealLabel(fact: Pick<CanonFact, 'knowledge' | 'revealChapter'>): string {
  const reveal = factReveal(fact);
  if (reveal.kind === 'planned') return `Hidden until ch ${reveal.chapter}`;
  if (reveal.kind === 'unscheduled') return 'Never revealed';
  return reveal.chapter != null ? `Known since ch ${reveal.chapter}` : 'Known';
}

export function secretCountLabel(count: number): string {
  return count === 1 ? '1 secret' : `${count} secrets`;
}

export const SUBJECT_NAMES_SHOWN = 2;

/** "On Mara Velan, Tideglass + 3 more" — names first, the long tail counted. */
export function subjectsLabel(names: readonly string[]): string {
  if (names.length === 0) return 'On no record yet';
  const shown = names.slice(0, SUBJECT_NAMES_SHOWN).join(', ');
  const rest = names.length - SUBJECT_NAMES_SHOWN;
  return rest > 0 ? `On ${shown} + ${rest} more` : `On ${shown}`;
}

export interface TimelineMark {
  chapter: number;
  /** Percent along the strip, 0 at chapter 1 and 100 at the last planned reveal. */
  position: number;
  factKeys: string[];
}

/** One mark per planned chapter, several secrets revealed together sharing it. */
export function revealTimeline(facts: readonly Pick<CanonFact, 'factKey' | 'revealChapter' | 'knowledge'>[]): { last: number; marks: TimelineMark[] } {
  const byChapter = new Map<number, string[]>();
  for (const fact of facts) {
    if (!isSecret(fact) || fact.revealChapter == null) continue;
    const keys = byChapter.get(fact.revealChapter);
    if (keys) keys.push(fact.factKey);
    else byChapter.set(fact.revealChapter, [fact.factKey]);
  }
  const chapters = [...byChapter.keys()].sort((a, b) => a - b);
  const last = Math.max(1, ...chapters);
  return { last, marks: chapters.map(chapter => ({ chapter, position: timelinePosition(chapter, last), factKeys: [...(byChapter.get(chapter) ?? [])].sort() })) };
}

export function timelinePosition(chapter: number, last: number): number {
  if (last <= 1) return 0;
  const clamped = Math.min(Math.max(chapter, 1), last);
  return ((clamped - 1) / (last - 1)) * 100;
}
