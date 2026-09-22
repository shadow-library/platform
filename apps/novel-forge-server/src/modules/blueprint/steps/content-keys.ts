import { type Ledger } from '@server/database';

import { type ContentOp } from '../../refinement/change-set';
import { mergeLedgerLinks } from '../ledger/ledger-entries';

export const CONTENT_KEY_WORDS = 6;
export const CONTENT_NAME_MAX = 80;

const WORDS = /[^a-z0-9]+/g;

/**
 * A snake_case content key made from what the author wrote, in the shape every other generator gives entities and facts, so re-locking
 * the same answer upserts the same record rather than piling up a second one. A reworded answer takes a new key and the old one is
 * removed by `removedContentOps`.
 */
export function contentKey(prefix: string, text: string, taken: Set<string>): string {
  const words = text.toLowerCase().replace(WORDS, ' ').trim().split(' ').filter(Boolean).slice(0, CONTENT_KEY_WORDS);
  const base = [prefix, words.join('_') || 'unnamed'].filter(Boolean).join('_');
  let key = base;
  for (let suffix = 2; taken.has(key); suffix++) key = `${base}_${suffix}`;
  taken.add(key);
  return key;
}

/** A record's name is a label, not its body: a rule long enough to be a paragraph still has to read as one row on the Story Bible screen. */
export function shortName(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= CONTENT_NAME_MAX ? trimmed : `${trimmed.slice(0, CONTENT_NAME_MAX - 1).trimEnd()}…`;
}

/** What this step's active decisions say they produced, which is what a re-lock has to account for. */
export function lockedLinks(ledger: Ledger.Entry[], stepKey: string, topics?: readonly string[]): Ledger.Links {
  return ledger
    .filter(entry => entry.kind === 'decision' && entry.stepKey === stepKey && (topics === undefined || topics.includes(entry.topic)))
    .reduce<Ledger.Links>((merged, entry) => mergeLedgerLinks(merged, entry.links), {});
}

/**
 * Content an earlier lock of the same step materialised that this one no longer claims: a retired rule must not keep holding the writer
 * to it. `keep` names records another step now owns — a character this step listed before the Core phase made them the opposition — and
 * they are never dropped, because the links this is read from say only what this step once claimed, not who claims it today.
 */
export function removedContentOps(previous: Ledger.Links, next: Ledger.Links, keep: ReadonlySet<string | number> = new Set()): ContentOp[] {
  const dropped = <K extends 'entityKeys' | 'factKeys' | 'volumeKeys' | 'arcKeys'>(key: K): string[] => {
    const kept = new Set(next[key] ?? []);
    return (previous[key] ?? []).filter(item => !kept.has(item) && !keep.has(item));
  };
  const keptChapters = new Set(next.briefChapters ?? []);
  return [
    ...dropped('entityKeys').map((entityKey): ContentOp => ({ op: 'entity.remove', entityKey })),
    ...dropped('factKeys').map((factKey): ContentOp => ({ op: 'fact.remove', factKey })),
    ...(previous.briefChapters ?? []).filter(chapter => !keptChapters.has(chapter) && !keep.has(chapter)).map((chapter): ContentOp => ({ op: 'brief.remove', chapter })),
    ...dropped('arcKeys').map((arcKey): ContentOp => ({ op: 'arc.remove', arcKey })),
    ...dropped('volumeKeys').map((volumeKey): ContentOp => ({ op: 'volume.remove', volumeKey })),
  ];
}
