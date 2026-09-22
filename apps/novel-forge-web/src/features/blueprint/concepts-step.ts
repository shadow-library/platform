import { type BlueprintRoundResponse } from '@/lib/apis';

import { type OptionVerdicts } from './round';

export const CONCEPT_TITLE_MAX = 80;
export const CONCEPT_LOGLINE_MAX = 280;
export const CONCEPT_KEPT_WHY_MAX = 500;

export interface ConceptCard {
  id: string;
  title: string;
  logline: string;
  engine: string;
  hook: string;
  fromAuthor: boolean;
}

export interface ConceptEdit {
  title?: string;
  logline?: string;
}

export type ConceptEdits = Record<string, ConceptEdit>;

/** Anything the round does not describe as a card is dropped rather than rendered half-built. */
export function parseConceptCards(round: BlueprintRoundResponse | null): ConceptCard[] {
  const cards = (round?.options as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards)) return [];
  return cards.flatMap(candidate => {
    const card = candidate as { id?: unknown; title?: unknown; logline?: unknown; engine?: unknown; hook?: unknown; fromAuthor?: unknown };
    const strings = [card.id, card.title, card.logline, card.engine, card.hook];
    if (!strings.every(value => typeof value === 'string')) return [];
    return [
      {
        id: card.id as string,
        title: card.title as string,
        logline: card.logline as string,
        engine: card.engine as string,
        hook: card.hook as string,
        fromAuthor: card.fromAuthor === true,
      },
    ];
  });
}

export function conceptsRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export function editedCard(card: ConceptCard, edits: ConceptEdits): ConceptCard {
  const edit = edits[card.id];
  return { ...card, title: edit?.title?.trim() || card.title, logline: edit?.logline?.trim() || card.logline };
}

export interface ConceptsSelection {
  kept: { optionId: string; title?: string; logline?: string; why?: string };
  killed?: { optionId: string; reason: string }[];
}

/**
 * The lock's answer: the card the author kept, with their edits, and every card they killed with the reason they gave.
 * A kill without a reason is not sent — the reason is the whole point of the entry it writes.
 */
export function buildConceptsSelection(cards: ConceptCard[], keptId: string | null, edits: ConceptEdits, verdicts: OptionVerdicts, why: string): ConceptsSelection | null {
  const kept = cards.find(card => card.id === keptId);
  if (!kept) return null;
  const edit = edits[kept.id];
  const title = edit?.title?.trim();
  const logline = edit?.logline?.trim();
  const keptWhy = why.trim();
  const killed = cards
    .filter(card => card.id !== kept.id && verdicts[card.id]?.verdict === 'not' && Boolean(verdicts[card.id]?.reason?.trim()))
    .map(card => ({ optionId: card.id, reason: (verdicts[card.id]?.reason ?? '').trim() }));
  return {
    kept: {
      optionId: kept.id,
      ...(title && title !== kept.title ? { title } : {}),
      ...(logline && logline !== kept.logline ? { logline } : {}),
      ...(keptWhy ? { why: keptWhy } : {}),
    },
    ...(killed.length > 0 ? { killed } : {}),
  };
}

export interface ConceptTally {
  kept: number;
  killed: number;
}

export function conceptTally(cards: ConceptCard[], keptId: string | null, verdicts: OptionVerdicts): ConceptTally {
  return {
    kept: cards.some(card => card.id === keptId) ? 1 : 0,
    killed: cards.filter(card => verdicts[card.id]?.verdict === 'not').length,
  };
}
