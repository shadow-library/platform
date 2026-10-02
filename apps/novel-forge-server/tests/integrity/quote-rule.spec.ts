import { describe, expect, it } from 'bun:test';

import { type RecordFields } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '@modules/refinement/change-set';
import {
  DIRECT_OP_KINDS,
  exceedsNoveltyBudget,
  exceedsRemovalBudget,
  launders,
  opReferences,
  type OpSource,
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
const ACTIONS = ['action.finalize', 'action.approve_draft', 'action.generate_chapter', 'action.advance_volume', 'action.revise_draft', 'action.organise_notes'] as const;
const REMOVALS = ['entity.remove', 'fact.remove', 'volume.remove', 'brief.remove', 'draft.remove', 'milestone.remove', 'promise.drop', 'bible_document.remove'] as const;
const CASES_PER_TEST = 25;
const TESTS = 8;

/** Written here rather than imported: what the policy may apply is asserted against this list, not against the policy's own tables. */
const QUOTED_KINDS: ReadonlySet<string> = new Set(['premise.update', 'bible_document.upsert', 'entity.upsert', 'fact.upsert', 'volume.upsert', 'promise.create', 'promise.update']);
const IDEA_KINDS: ReadonlySet<string> = new Set([
  'premise.update',
  'bible_document.upsert',
  'entity.upsert',
  'volume.upsert',
  'milestone.upsert',
  'promise.create',
  'promise.update',
]);
const NEVER_DIRECT: ReadonlySet<string> = new Set([...REMOVALS, 'brief.update', 'draft.update', 'promise.set_payoff', 'organise.rule']);
const FACT_GATING = ['writerNote', 'revealChapter', 'unlock', 'allowedClues'] as const;
const METADATA: ReadonlySet<string> = new Set(['op', 'quote', 'rationale', 'ideaId']);

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

function existingRecords(rng: SeededRandom): Map<string, RecordFields> {
  const existing = new Map<string, RecordFields>(rng.subset(KEYS).map(key => [`entity:${key}`, { name: key, notes: rng.chance(0.5) ? rng.pick(STATED) : null } as RecordFields]));
  if (rng.chance(0.5)) existing.set('premise', { premise: rng.pick(STATED) } as RecordFields);
  for (const key of rng.subset(KEYS)) existing.set(`fact:${key}_secret`, { body: rng.pick(STATED), terms: rng.chance(0.5) ? [key] : null });
  for (const key of rng.subset(KEYS)) existing.set(`milestone:${key}_moment`, { label: rng.pick(STATED), subjectEntityKey: rng.chance(0.5) ? key : null, kind: 'event' });
  for (const key of rng.subset(KEYS)) {
    existing.set(`promise:thread:${key}_thread`, {
      label: rng.pick(STATED),
      status: rng.pick(['open', 'open', 'closed']),
      payoffMilestoneKey: rng.chance(0.4) ? `${key}_moment` : null,
      payoffVolumeKey: rng.chance(0.3) ? 'v3' : null,
      payoffWindow: rng.chance(0.3) ? 12 : null,
    });
  }
  if (rng.chance(0.4)) existing.set('volume:v3', { title: 'The Low Water', objective: rng.chance(0.5) ? rng.pick(STATED) : null, ordinal: 3 });
  return existing;
}

/** One chat turn: an author message, a change-set whose ops quote it (or not), the records that already exist and how the session lands changes. */
function generateTurn(seed: number): Turn {
  const rng = new SeededRandom(seed);
  const message: string[] = [];
  const existing = existingRecords(rng);
  const ops: ChangeOp[] = [];
  for (let count = rng.int(1, 6); count > 0; count--) {
    const { quote, words } = quoteFor(rng, message);
    const key = rng.pick(KEYS);
    const text = rng.chance(0.7) ? words : rng.pick(INVENTED);
    const kind = rng.weighted([
      ['entity.upsert', 5],
      ['fact.upsert', 4],
      ['premise.update', 2],
      ['bible_document.upsert', 2],
      ['volume.upsert', 2],
      ['promise.create', 1],
      ['promise.update', 2],
      ['promise.set_payoff', 2],
      ['brief.update', 2],
      ['draft.update', 1],
      ['milestone.upsert', 2],
      ['organise.rule', 1],
      ['removal', 2],
      ['action', 2],
    ] as const);
    const withQuote = <T extends object>(op: T): ChangeOp => ({ ...op, ...(quote === undefined ? {} : { quote }) }) as unknown as ChangeOp;
    if (kind === 'entity.upsert') ops.push(withQuote({ op: kind, entityKey: key, type: 'character', name: key, notes: rng.chance(0.1) ? '' : text }));
    if (kind === 'fact.upsert') {
      const gating = rng.chance(0.4) ? rng.pick(FACT_GATING) : undefined;
      const gatingValue = {
        writerNote: 'Hint at it.',
        revealChapter: rng.chance(0.5) ? 9 : null,
        unlock: { all: [{ milestone: `${key}_moment` }] },
        allowedClues: ['a cold lamp'],
      };
      ops.push(
        withQuote({
          op: kind,
          factKey: `${key}_secret`,
          ...(rng.chance(0.8) ? { body: text } : {}),
          subjects: rng.chance(0.6) ? [rng.pick(KEYS)] : undefined,
          ...(rng.chance(0.3) ? { terms: [key] } : {}),
          ...(gating ? { [gating]: gatingValue[gating] } : {}),
        }),
      );
    }
    if (kind === 'premise.update') {
      const field = rng.pick(['premise', 'premise', 'brief', 'themes', 'instructions']);
      ops.push(withQuote({ op: kind, [field]: field === 'themes' ? [text] : text }));
    }
    if (kind === 'bible_document.upsert')
      ops.push(withQuote(rng.chance(0.3) ? { op: kind, section: 'project', slug: 'timeline', body: text } : { op: kind, section: 'world', slug: `${key}-notes`, body: text }));
    if (kind === 'volume.upsert')
      ops.push(withQuote({ op: kind, volumeKey: 'v3', title: 'The Low Water', ...(rng.chance(0.5) ? { objective: text } : {}), ...(rng.chance(0.2) ? { body: text } : {}) }));
    if (kind === 'promise.create') ops.push(withQuote({ op: kind, kind: 'thread', key: `${key}_thread`, label: text }));
    if (kind === 'promise.update') {
      const change = rng.pick([{ label: text }, { label: text }, { status: 'paid_off' }, { lastAdvancedChapter: 4 }]);
      ops.push(withQuote({ op: kind, kind: 'thread', key: `${key}_thread`, ...change }));
    }
    if (kind === 'promise.set_payoff') {
      const payoff = rng.pick([{ someday: true }, { payoffMilestoneKey: null }, { payoffWindow: 7 }, { payoffVolumeKey: 'v3', dormant: true }, { someday: true, dormant: false }]);
      ops.push(withQuote({ op: kind, kind: 'thread', key: `${key}_thread`, ...payoff }));
    }
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
    if (kind === 'milestone.upsert')
      ops.push(withQuote({ op: kind, milestoneKey: `${key}_moment`, label: text, subjectEntityKey: rng.chance(0.5) ? rng.pick([...KEYS, null]) : undefined }));
    if (kind === 'organise.rule') ops.push(withQuote({ op: kind, rule: text, optionId: 'r1' }));
    if (kind === 'removal') {
      const removal = rng.pick(REMOVALS);
      const target = {
        'entity.remove': { entityKey: key },
        'fact.remove': { factKey: `${key}_secret` },
        'volume.remove': { volumeKey: 'v3' },
        'brief.remove': { chapter: rng.int(1, 6) },
        'draft.remove': { chapter: rng.int(1, 6) },
        'milestone.remove': { milestoneKey: `${key}_moment` },
        'promise.drop': { kind: 'thread', key: `${key}_thread` },
        'bible_document.remove': { section: 'world', slug: `${key}-notes` },
      }[removal];
      ops.push(withQuote({ op: removal, ...target }));
    }
    if (kind === 'action') {
      const action = rng.pick(ACTIONS);
      const args = action === 'action.advance_volume' ? { volumeKey: 'v3' } : action === 'action.revise_draft' ? { chapter: 2, note: text } : { chapter: 2 };
      ops.push(withQuote({ op: action, ...args }));
    }
  }
  const mode = rng.chance(0.85) ? 'auto' : 'manual';
  const input: WritePolicyInput = {
    ops,
    authorMessage: [...message, ...(rng.chance(0.3) ? [rng.pick(STATED)] : [])].join('. '),
    mode,
    ideas: 'apply',
    hold: rng.weighted([
      ['none', 8],
      ['turn', 1],
      ['writer_read', 4],
    ] as const),
    justDiscussing: rng.chance(0.1),
    state: { current: existing },
  };
  return { input, describe: `seed ${seed}: ${JSON.stringify({ ...input, state: [...existing.keys()] })}` };
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value !== 'string' || value.trim() !== '';
}

function plannerSide(op: ChangeOp): boolean {
  return op.op === 'milestone.upsert';
}

/** What an op may never do on the applied side, checked from the op and the record alone. */
function forbiddenDirect(op: ChangeOp, current: RecordFields | undefined, source: OpSource): string | undefined {
  const fields = op as unknown as Record<string, unknown>;
  if (op.op.startsWith('action.')) return 'an action';
  if (NEVER_DIRECT.has(op.op)) return 'a kind that is always a card';
  if (!(source === 'quoted' ? QUOTED_KINDS : IDEA_KINDS).has(op.op)) return `a kind ${source} ops never take`;
  const cleared = Object.keys(fields).filter(field => !METADATA.has(field) && fields[field] !== undefined && !isFilled(fields[field]) && isFilled(current?.[field]));
  if (cleared.length > 0) return `cleared ${cleared.join(', ')}`;
  if (op.op === 'bible_document.upsert' && op.slug === 'timeline') return 'a planner-only page';
  if (op.op === 'premise.update' && Object.keys(fields).some(field => !METADATA.has(field) && isFilled(current?.[field]))) return 'a replaced story field';
  if (op.op === 'volume.upsert' && (op.body !== undefined || (source === 'idea' && op.objective !== undefined))) return "a volume's notes or an invented goal";
  if (op.op === 'promise.update' && (op.status !== undefined || op.lastAdvancedChapter !== undefined)) return "a promise's disposition or progress";
  if (op.op !== 'fact.upsert') return undefined;
  if (FACT_GATING.some(field => fields[field] !== undefined)) return "a secret's gating";
  if (current && (op.body !== undefined || op.terms !== undefined)) return "an existing secret's truth or tells";
  return undefined;
}

function refsCreatedByCards(input: WritePolicyInput, cards: readonly ChangeOp[]): Set<string> {
  return new Set(cards.flatMap(op => changeSetRefs([op]).filter(ref => !input.state.current.has(ref))));
}

function quoteRulePermits(op: ChangeOp, input: WritePolicyInput): boolean {
  const [ref] = changeSetRefs([op]);
  const current = ref === undefined ? undefined : input.state.current.get(ref);
  const vocabulary = input.vocabulary ?? input.authorMessage;
  return (
    DIRECT_OP_KINDS.has(op.op) &&
    typeof op.quote === 'string' &&
    op.quote.trim() !== '' &&
    quoteFoundIn(op.quote, input.authorMessage) &&
    !quoteIsTentative(op.quote, input.authorMessage) &&
    !launders(op, current, vocabulary) &&
    !exceedsRemovalBudget(op, current) &&
    !exceedsNoveltyBudget(op, current, vocabulary)
  );
}

/** Everything the write policy and the dependency split promise about one turn, whatever it holds. */
function expectQuoteRuleHolds({ input, describe: turn }: Turn): void {
  const split = splitChangeSet(input);
  const context = { turn, direct: split.direct.map(op => op.op), dispositions: split.dispositions };

  expect(
    split.dispositions.map(disposition => disposition.index).sort((left, right) => left - right),
    JSON.stringify(context),
  ).toEqual(input.ops.map((_, index) => index));
  expect(split.direct.length + split.cards.length, JSON.stringify(context)).toBe(input.ops.length);
  expect(split.sources, JSON.stringify(context)).toEqual(split.dispositions.flatMap(d => (d.side === 'direct' ? [d.source] : [])));

  for (const disposition of split.dispositions) {
    if (disposition.side !== 'direct') continue;
    const op = input.ops[disposition.index] as ChangeOp;
    const [ref] = changeSetRefs([op]);
    const current = ref === undefined ? undefined : input.state.current.get(ref);
    const override = input.mode !== 'auto' || input.hold === 'turn' || input.justDiscussing;
    expect(override, `${op.op} applied in a turn that applies nothing — ${JSON.stringify(context)}`).toBe(false);
    if (input.hold === 'writer_read')
      expect(plannerSide(op), `${op.op} applied what the chapter writer or a reader can see in a held turn — ${JSON.stringify(context)}`).toBe(true);
    expect(forbiddenDirect(op, current, disposition.source), `${op.op} applied as ${disposition.source} — ${JSON.stringify(context)}`).toBeUndefined();
    expect(exceedsRemovalBudget(op, current), `${op.op} truncated a field without review — ${JSON.stringify(context)}`).toBe(false);
    expect(disposition.source, `${op.op} carries the wrong source — ${JSON.stringify(context)}`).toBe(quoteRulePermits(op, input) ? 'quoted' : 'idea');
  }
  for (const op of split.cards) expect(split.direct.includes(op)).toBe(false);
  for (const op of input.ops)
    if (op.op.startsWith('action.') || NEVER_DIRECT.has(op.op)) expect(split.cards.includes(op), `${op.op} must always be a card — ${JSON.stringify(context)}`).toBe(true);

  const cardCreated = refsCreatedByCards(input, split.cards);
  for (const op of split.direct) {
    const leaning = [...changeSetRefs([op]), ...opReferences(op)].filter(ref => cardCreated.has(ref));
    expect(leaning, `${op.op} applied while it relies on a record only a card creates — ${JSON.stringify(context)}`).toEqual([]);
  }

  const reversed = splitChangeSet({ ...input, ops: [...input.ops].reverse() });
  expect(new Set(reversed.direct), `the split depends on op order — ${JSON.stringify(context)}`).toEqual(new Set(split.direct));
  expect(splitChangeSet({ ...input, authorMessage: '' }).sources.every(source => source === 'idea')).toBe(true);
  expect(splitChangeSet({ ...input, justDiscussing: true }).direct).toEqual([]);

  const quoteRuleOnly = splitChangeSet({ ...input, ideas: 'card' });
  for (const op of quoteRuleOnly.direct) expect(quoteRulePermits(op, input), `${op.op} applied without its quote — ${JSON.stringify(context)}`).toBe(true);
  expect(splitChangeSet({ ...input, ideas: 'card', authorMessage: '' }).direct).toEqual([]);
}

describe('quote rule and dependency split — seeded chat turns', () => {
  for (let batch = 0; batch < TESTS; batch++) {
    const seeds = Array.from({ length: CASES_PER_TEST }, (_, index) => 9000 + batch * CASES_PER_TEST + index);
    it(`should apply only what the write policy allows, each applied op marked quoted or idea, for turns ${seeds[0]}–${seeds.at(-1)}`, () => {
      for (const seed of seeds) expectQuoteRuleHolds(generateTurn(seed));
    });
  }

  it('should have generated turns that exercise both sides of the split', () => {
    const turns = Array.from({ length: TESTS * CASES_PER_TEST }, (_, index) => generateTurn(9000 + index).input);
    const quoteRuleOnly = turns.map(input => splitChangeSet({ ...input, ideas: 'card' }));
    const editFreely = turns.map(input => splitChangeSet(input));
    expect(quoteRuleOnly.filter(turn => turn.direct.length > 0).length).toBeGreaterThan(20);
    expect(quoteRuleOnly.filter(turn => turn.dispositions.some(disposition => disposition.side === 'card' && disposition.reason === 'depends_on_card')).length).toBeGreaterThan(0);
    expect(editFreely.filter(turn => turn.sources.includes('idea')).length).toBeGreaterThan(20);
  });

  it('should have generated writer-read holds that applied planner-side ops and held the rest', () => {
    const turns = Array.from({ length: TESTS * CASES_PER_TEST }, (_, index) => generateTurn(9000 + index).input).filter(input => input.hold === 'writer_read');
    const splits = turns.map(input => splitChangeSet(input));

    expect(splits.filter(split => split.direct.length > 0).length).toBeGreaterThan(5);
    expect(splits.filter(split => split.held === 'writer_read').length).toBeGreaterThan(5);
  });

  it('should have generated the kinds Edit freely must keep cards, and kept some of them only because they were ideas', () => {
    const turns = Array.from({ length: TESTS * CASES_PER_TEST }, (_, index) => generateTurn(9000 + index).input);
    const ops = turns.flatMap(input => input.ops as unknown as readonly Record<string, unknown>[]);
    const ideaRules = turns.flatMap(input => splitChangeSet(input).dispositions.flatMap(d => (d.side === 'card' && d.reason !== 'always_card' && d.rule ? [d.rule] : [])));

    expect(ops.filter(op => String(op['op']).startsWith('action.')).length).toBeGreaterThan(10);
    expect(ops.filter(op => op['op'] === 'promise.set_payoff' && op['someday'] === true).length).toBeGreaterThan(5);
    expect(ops.filter(op => op['op'] === 'fact.upsert' && FACT_GATING.some(field => op[field] !== undefined)).length).toBeGreaterThan(10);
    expect(new Set(ideaRules)).toEqual(new Set(['secret_truth', 'planner_only_field', 'notebook_direction']));
  });
});
