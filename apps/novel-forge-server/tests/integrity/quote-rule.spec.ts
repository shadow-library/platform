import { describe, expect, it } from 'bun:test';

import { type RecordFields } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import {
  ALWAYS_CARD,
  alwaysCardRule,
  DIRECT_OP_KINDS,
  exceedsNoveltyBudget,
  exceedsRemovalBudget,
  launders,
  opReferences,
  quoteFoundIn,
  quoteIsTentative,
  splitChangeSet,
  type WritePolicyInput,
} from '@modules/refinement/write-policy';

import { SeededRandom } from './seeded-random';

const STATED = [
  'Ada keeps the harbour lamp lit every night of the flood season',
  'Bram mends the ferry ropes with salt-stiff hands before dawn',
  'The salt market closes its gates when the tide bell rings twice',
  'Volume three is called The Low Water, and its goal is to reopen the ferry',
  'The river lords tax every boat that crosses under the old bridge',
];
const TENTATIVE = ['Maybe Bram once sailed with the river lords', 'Should Ada have a younger brother in the salt market?', 'Perhaps the ferry could sink in chapter nine'];
const NEGATED = ['Bram is not a smuggler, whatever the harbour says'];
const INVENTED = [
  'Ada was raised by pirates on a burning island and fears every bell since her mother vanished beneath the reef.',
  'The lamp is secretly powered by the stolen voices of drowned sailors.',
];
const KEYS = ['ada', 'bram', 'lamp', 'market', 'ferry'];
const CASES_PER_TEST = 25;
const TESTS = 8;

interface Turn {
  input: WritePolicyInput;
  describe: string;
}

function quoteFor(rng: SeededRandom, message: string[]): { quote?: string; words: string } {
  const source = rng.weighted([
    ['stated', 6],
    ['tentative', 2],
    ['negated', 1],
    ['invented', 1],
    ['none', 1],
  ] as const);
  if (source === 'none') return { words: rng.pick(STATED) };
  const words = rng.pick(source === 'stated' ? STATED : source === 'tentative' ? TENTATIVE : source === 'negated' ? NEGATED : INVENTED);
  if (source === 'stated' || source === 'tentative' || source === 'negated') message.push(words);
  return { quote: rng.chance(0.85) ? words : `${words} and more besides`, words };
}

/** One chat turn: an author message, a change-set whose ops quote it (or not), the records that already exist and how the session lands changes. */
function generateTurn(seed: number): Turn {
  const rng = new SeededRandom(seed);
  const message: string[] = [];
  const existing = new Map<string, RecordFields>(rng.subset(KEYS).map(key => [`entity:${key}`, { name: key, notes: rng.chance(0.5) ? rng.pick(STATED) : null } as RecordFields]));
  if (rng.chance(0.5)) existing.set('premise', { premise: rng.pick(STATED) } as RecordFields);
  const ops: ChangeOp[] = [];
  for (let count = rng.int(1, 5); count > 0; count--) {
    const { quote, words } = quoteFor(rng, message);
    const key = rng.pick(KEYS);
    const text = rng.chance(0.7) ? words : rng.pick(INVENTED);
    const kind = rng.weighted([
      ['entity.upsert', 5],
      ['fact.upsert', 3],
      ['premise.update', 2],
      ['bible_document.upsert', 2],
      ['volume.upsert', 1],
      ['promise.create', 1],
      ['brief.update', 2],
      ['draft.update', 1],
      ['milestone.upsert', 1],
      ['entity.remove', 1],
    ] as const);
    const withQuote = <T extends object>(op: T): ChangeOp => ({ ...op, ...(quote === undefined ? {} : { quote }) }) as unknown as ChangeOp;
    if (kind === 'entity.upsert') ops.push(withQuote({ op: kind, entityKey: key, type: 'character', name: key, notes: text }));
    if (kind === 'fact.upsert')
      ops.push(
        withQuote({
          op: kind,
          factKey: `${key}_secret`,
          body: text,
          subjects: rng.chance(0.6) ? [rng.pick(KEYS)] : undefined,
          ...(rng.chance(0.3) ? { unlock: { all: [{ milestone: `${key}_moment` }] } } : {}),
        }),
      );
    if (kind === 'premise.update') ops.push(withQuote({ op: kind, premise: text }));
    if (kind === 'bible_document.upsert')
      ops.push(withQuote(rng.chance(0.3) ? { op: kind, section: 'project', slug: 'timeline', body: text } : { op: kind, section: 'world', slug: `${key}-notes`, body: text }));
    if (kind === 'volume.upsert') ops.push(withQuote({ op: kind, volumeKey: 'v3', title: 'The Low Water', objective: text }));
    if (kind === 'promise.create') ops.push(withQuote({ op: kind, kind: 'thread', key: `${key}_thread`, label: text }));
    if (kind === 'brief.update')
      ops.push(
        withQuote({
          op: kind,
          chapter: rng.int(1, 6),
          knowledgeContract: { pov: [key], learns: [{ entityKey: rng.pick(KEYS), factKey: `${rng.pick(KEYS)}_secret` }] },
          claimedMilestones: rng.chance(0.5) ? [`${key}_moment`] : undefined,
        }),
      );
    if (kind === 'draft.update') ops.push(withQuote({ op: kind, chapter: rng.int(1, 6), body: text }));
    if (kind === 'milestone.upsert') ops.push(withQuote({ op: kind, milestoneKey: `${key}_moment`, label: text, subjectEntityKey: rng.chance(0.5) ? rng.pick(KEYS) : undefined }));
    if (kind === 'entity.remove') ops.push(withQuote({ op: kind, entityKey: key }));
  }
  const mode = rng.chance(0.85) ? 'auto' : 'manual';
  const input: WritePolicyInput = {
    ops,
    authorMessage: [...message, ...(rng.chance(0.3) ? [rng.pick(STATED)] : [])].join('. '),
    mode,
    held: rng.chance(0.1),
    justDiscussing: rng.chance(0.1),
    state: { current: existing },
  };
  return { input, describe: `seed ${seed}: ${JSON.stringify({ ...input, state: [...existing.keys()] })}` };
}

function refsCreatedByCards(input: WritePolicyInput, cards: readonly ChangeOp[]): Set<string> {
  return new Set(cards.flatMap(op => changeSetRefs([op]).filter(ref => !input.state.current.has(ref))));
}

/** Everything the quote rule and the dependency split promise about one turn, whatever it holds. */
function expectQuoteRuleHolds({ input, describe: turn }: Turn): void {
  const split = splitChangeSet(input);
  const vocabulary = input.vocabulary ?? input.authorMessage;
  const context = { turn, direct: split.direct.map(op => op.op), dispositions: split.dispositions };

  expect(
    split.dispositions.map(disposition => disposition.index).sort((left, right) => left - right),
    JSON.stringify(context),
  ).toEqual(input.ops.map((_, index) => index));
  expect(split.direct.length + split.cards.length, JSON.stringify(context)).toBe(input.ops.length);

  for (const op of split.direct) {
    const [ref] = changeSetRefs([op]);
    const current = ref === undefined ? undefined : input.state.current.get(ref);
    const permitted =
      input.mode === 'auto' &&
      !input.held &&
      !input.justDiscussing &&
      DIRECT_OP_KINDS.has(op.op) &&
      alwaysCardRule(op, input.state) === undefined &&
      typeof op.quote === 'string' &&
      op.quote.trim() !== '' &&
      quoteFoundIn(op.quote, input.authorMessage) &&
      !quoteIsTentative(op.quote, input.authorMessage) &&
      !launders(op, current, vocabulary) &&
      !exceedsRemovalBudget(op, current) &&
      !exceedsNoveltyBudget(op, current, vocabulary);
    expect(permitted, `${op.op} applied without review against the quote rule — ${JSON.stringify(context)}`).toBe(true);
  }
  for (const op of split.cards) expect(split.direct.includes(op)).toBe(false);
  for (const op of input.ops) if (ALWAYS_CARD[op.op]) expect(split.cards.includes(op), `${op.op} must always be a card — ${JSON.stringify(context)}`).toBe(true);

  const cardCreated = refsCreatedByCards(input, split.cards);
  for (const op of split.direct) {
    const leaning = [...changeSetRefs([op]), ...opReferences(op)].filter(ref => cardCreated.has(ref));
    expect(leaning, `${op.op} applied while it relies on a record only a card creates — ${JSON.stringify(context)}`).toEqual([]);
  }

  const reversed = splitChangeSet({ ...input, ops: [...input.ops].reverse() });
  expect(new Set(reversed.direct), `the split depends on op order — ${JSON.stringify(context)}`).toEqual(new Set(split.direct));
  expect(splitChangeSet({ ...input, authorMessage: '' }).direct).toEqual([]);
  expect(splitChangeSet({ ...input, justDiscussing: true }).direct).toEqual([]);
}

describe('quote rule and dependency split — seeded chat turns', () => {
  for (let batch = 0; batch < TESTS; batch++) {
    const seeds = Array.from({ length: CASES_PER_TEST }, (_, index) => 9000 + batch * CASES_PER_TEST + index);
    it(`should apply only quoted, stated, non-dependent ops for turns ${seeds[0]}–${seeds.at(-1)}`, () => {
      for (const seed of seeds) expectQuoteRuleHolds(generateTurn(seed));
    });
  }

  it('should have generated turns that exercise both sides of the split', () => {
    const turns = Array.from({ length: TESTS * CASES_PER_TEST }, (_, index) => splitChangeSet(generateTurn(9000 + index).input));
    expect(turns.filter(turn => turn.direct.length > 0).length).toBeGreaterThan(20);
    expect(turns.filter(turn => turn.dispositions.some(disposition => disposition.reason === 'depends_on_card')).length).toBeGreaterThan(0);
  });
});
