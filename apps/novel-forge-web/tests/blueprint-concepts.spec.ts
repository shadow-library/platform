import { describe, expect, it } from 'bun:test';

import { buildConceptsSelection, conceptsRoundKey, conceptTally, editedCard, parseConceptCards } from '../src/features/blueprint/concepts-step';
import { type OptionVerdicts } from '../src/features/blueprint/round';
import { type BlueprintRoundResponse } from '../src/lib/apis';

function round(overrides: Partial<BlueprintRoundResponse> = {}): BlueprintRoundResponse {
  return {
    id: 'r2',
    stepKey: 'concepts',
    round: 2,
    status: 'ready',
    jobId: null,
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options: null,
    coachMessage: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const CARDS = [
  { id: 'c1', title: 'The Ledger of Salt', logline: 'A clerk audits the dead.', engine: 'an audit that keeps finding people', hook: 'The dead pay on time.', fromAuthor: true },
  { id: 'c2', title: 'Ninth Heir', logline: 'The succession picked the wrong sibling.', engine: 'a court that cannot be contradicted', hook: 'Everyone bows to a mistake.' },
];

const ready = (): BlueprintRoundResponse => round({ options: { cards: CARDS } });

describe('parseConceptCards', () => {
  it('should read every card a ready round offers', () => {
    const cards = parseConceptCards(ready());
    expect(cards.map(card => card.id)).toEqual(['c1', 'c2']);
    expect(cards[0]?.fromAuthor).toBe(true);
    expect(cards[1]?.fromAuthor).toBe(false);
  });

  it('should read a round with no cards as no cards', () => {
    expect(parseConceptCards(round())).toEqual([]);
    expect(parseConceptCards(round({ options: { cards: [{ id: 'c1', title: 'half a card' }] } }))).toEqual([]);
  });
});

describe('conceptsRoundKey', () => {
  it('should change when the cards arrive', () => {
    expect(conceptsRoundKey(round())).toBe('r2:pending');
    expect(conceptsRoundKey(ready())).toBe('r2:ready');
  });
});

describe('editedCard', () => {
  it('should prefer the author’s words and fall back to the card’s', () => {
    const [card] = parseConceptCards(ready());
    expect(editedCard(card!, { c1: { title: '  Salt Ledger  ' } })).toMatchObject({ title: 'Salt Ledger', logline: 'A clerk audits the dead.' });
    expect(editedCard(card!, { c1: { title: '   ' } }).title).toBe('The Ledger of Salt');
  });
});

describe('conceptTally', () => {
  it('should count what is kept and what is killed', () => {
    const cards = parseConceptCards(ready());
    expect(conceptTally(cards, 'c1', { c2: { verdict: 'not', reason: 'prophecy' } })).toEqual({ kept: 1, killed: 1 });
    expect(conceptTally(cards, null, {})).toEqual({ kept: 0, killed: 0 });
  });
});

describe('buildConceptsSelection', () => {
  const cards = parseConceptCards(ready());

  it('should refuse to build a lock with nothing kept', () => {
    expect(buildConceptsSelection(cards, null, {}, {}, '')).toBeNull();
    expect(buildConceptsSelection(cards, 'c9', {}, {}, '')).toBeNull();
  });

  it('should send the kept card, the author’s reason, and every kill that gave one', () => {
    const verdicts: OptionVerdicts = { c2: { verdict: 'not', reason: '  chosen-one prophecy  ' } };
    expect(buildConceptsSelection(cards, 'c1', {}, verdicts, '  the debt is personal  ')).toEqual({
      kept: { optionId: 'c1', why: 'the debt is personal' },
      killed: [{ optionId: 'c2', reason: 'chosen-one prophecy' }],
    });
  });

  it('should leave out a kill with no reason behind it', () => {
    const verdicts: OptionVerdicts = { c2: { verdict: 'not' }, c1: { verdict: 'more' } };
    expect(buildConceptsSelection(cards, 'c1', {}, verdicts, '')).toEqual({ kept: { optionId: 'c1' } });
  });

  it('should send an edit only when it differs from the card', () => {
    const unchanged = buildConceptsSelection(cards, 'c1', { c1: { title: 'The Ledger of Salt' } }, {}, '');
    expect(unchanged).toEqual({ kept: { optionId: 'c1' } });
    const edited = buildConceptsSelection(cards, 'c1', { c1: { logline: 'A clerk audits a year he never lived.' } }, {}, '');
    expect(edited).toEqual({ kept: { optionId: 'c1', logline: 'A clerk audits a year he never lived.' } });
  });
});
