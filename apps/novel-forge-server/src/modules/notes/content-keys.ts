import { type Ledger } from '@server/database';

import { mergeLedgerLinks } from '../ledger/ledger-entries';
import { type ContentOp } from '../refinement/change-set';

export const CONTENT_KEY_WORDS = 6;

const WORDS = /[^a-z0-9]+/g;

/**
 * A snake_case content key made from what the author wrote, in the shape every other generator gives entities and facts, so writing
 * the same answer again upserts the same record rather than piling up a second one. A reworded answer takes a new key and the old one
 * is removed by `removedContentOps`.
 */
export function contentKey(prefix: string, text: string, taken: Set<string>): string {
  const words = text.toLowerCase().replace(WORDS, ' ').trim().split(' ').filter(Boolean).slice(0, CONTENT_KEY_WORDS);
  const base = [prefix, words.join('_') || 'unnamed'].filter(Boolean).join('_');
  let key = base;
  for (let suffix = 2; taken.has(key); suffix++) key = `${base}_${suffix}`;
  taken.add(key);
  return key;
}

/** What a pass's active decisions say they produced, which is what its next run has to account for. */
export function lockedLinks(ledger: Ledger.Entry[], stepKey: string, topics?: readonly string[]): Ledger.Links {
  return ledger
    .filter(entry => entry.kind === 'decision' && entry.stepKey === stepKey && (topics === undefined || topics.includes(entry.topic)))
    .reduce<Ledger.Links>((merged, entry) => mergeLedgerLinks(merged, entry.links), {});
}

/** Records other passes' active decisions link, which no pass may remove on its own next run: two passes can derive one key from one name. */
export function linkedByOtherSteps(ledger: Pick<Ledger.Entry, 'kind' | 'stepKey' | 'links'>[], stepKey: string): Set<string> {
  return new Set(ledger.filter(entry => entry.kind === 'decision' && entry.stepKey !== stepKey).flatMap(entry => entry.links.entityKeys ?? []));
}

/**
 * Content an earlier run of the same pass materialised that this one no longer claims: a retired rule must not keep holding the writer
 * to it. `keep` names records someone else now owns, and they are never dropped, because the links this is read from say only what the
 * pass once claimed, not who claims it today. `keepRecords` protects entity keys alone, so a fact that shares a record's key is still
 * removed with its pass's answer.
 */
export function removedContentOps(
  previous: Ledger.Links,
  next: Ledger.Links,
  keep: ReadonlySet<string | number> = new Set(),
  keepRecords: ReadonlySet<string> = new Set(),
): ContentOp[] {
  const dropped = <K extends 'entityKeys' | 'factKeys' | 'volumeKeys'>(key: K): string[] => {
    const kept = new Set(next[key] ?? []);
    return (previous[key] ?? []).filter(item => !kept.has(item) && !keep.has(item) && !(key === 'entityKeys' && keepRecords.has(item)));
  };
  const keptChapters = new Set(next.briefChapters ?? []);
  return [
    ...dropped('entityKeys').map((entityKey): ContentOp => ({ op: 'entity.remove', entityKey })),
    ...dropped('factKeys').map((factKey): ContentOp => ({ op: 'fact.remove', factKey })),
    ...(previous.briefChapters ?? []).filter(chapter => !keptChapters.has(chapter) && !keep.has(chapter)).map((chapter): ContentOp => ({ op: 'brief.remove', chapter })),
    ...dropped('volumeKeys').map((volumeKey): ContentOp => ({ op: 'volume.remove', volumeKey })),
  ];
}
