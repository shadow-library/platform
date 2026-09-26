import { describe, expect, it } from 'bun:test';

import { renderTurnRules } from '@modules/ai/prompts/chat-refine.prompt';
import { HUB_INSTRUCTIONS } from '@modules/ai/prompts/scope-playbooks';
import { type RecordFields } from '@modules/refinement/artifact-state';
import { type ChangeOp, renderOpVocabulary, validateChangeSet } from '@modules/refinement/change-set';
import {
  type AlwaysCardRule,
  type CardReason,
  exceedsNoveltyBudget,
  exceedsRemovalBudget,
  opReferences,
  type OpSide,
  quoteFoundIn,
  quoteIsTentative,
  splitChangeSet,
  type WritePolicyInput,
} from '@modules/refinement/write-policy';

const AUTHOR_MESSAGE = [
  'Mira is a thief who works the Saltgate docks.',
  'Volume two is called The Drowned Court, and its goal is to unseat the tide-queen.',
  'Kael the smith owes Mira a debt he can’t repay.',
  'The Hollow Crown is a relic that eats its wearer’s memories.',
  'Should Mira have a sister in the court?',
  'Maybe Kael was once a soldier of the queen.',
  'Mira does not trust the harbour guild, whatever the rumours say.',
  'Aldo is no monk, he runs the Saltgate smuggling ring.',
].join('\n');
const EARLIER_MESSAGE = 'Brother Aldo guards the lower vaults of the monastery.';
const AI_REPLY = 'What if Mira secretly serves the tide-queen as a spy?';

type Existing = string[] | Record<string, RecordFields>;

interface PolicyOptions {
  existing?: Existing;
  mode?: WritePolicyInput['mode'];
  held?: boolean;
  justDiscussing?: boolean;
  vocabulary?: string;
  message?: string;
}

function policy(ops: ChangeOp[], options: PolicyOptions = {}) {
  const { existing = [], mode = 'auto', held = false, justDiscussing, vocabulary, message = AUTHOR_MESSAGE } = options;
  const entries: [string, RecordFields][] = Array.isArray(existing) ? existing.map(ref => [ref, {}]) : Object.entries(existing);
  return splitChangeSet({ ops, authorMessage: message, vocabulary, mode, held, justDiscussing, state: { current: new Map(entries) } });
}

interface Expected {
  side: OpSide;
  reason?: CardReason;
  rule?: AlwaysCardRule;
}

interface Case extends PolicyOptions {
  name: string;
  op: ChangeOp;
  expected: Expected;
}

const mira = (fields: Partial<Extract<ChangeOp, { op: 'entity.upsert' }>> = {}): ChangeOp => ({
  op: 'entity.upsert',
  entityKey: 'mira',
  type: 'character',
  name: 'Mira',
  ...fields,
});
const fact = (fields: Partial<Extract<ChangeOp, { op: 'fact.upsert' }>> = {}): ChangeOp => ({ op: 'fact.upsert', factKey: 'crown', ...fields });
const QUOTE = 'Mira is a thief who works the Saltgate docks';
const CROWN_QUOTE = 'The Hollow Crown is a relic that eats its wearer’s memories';
const VOLUME_QUOTE = 'Volume two is called The Drowned Court';
const INVENTED = 'Mira was raised by smugglers in a lighthouse and fears deep water since her brother drowned near the reef.';

const QUOTE_CASES: Case[] = [
  { name: 'an entity whose quote is in the message applies', op: mira({ quote: QUOTE }), expected: { side: 'direct' } },
  { name: 'an entity without a quote is a card', op: mira(), expected: { side: 'card', reason: 'no_quote' } },
  { name: 'a blank quote counts as none', op: mira({ quote: '   ' }), expected: { side: 'card', reason: 'no_quote' } },
  { name: 'a quote from an earlier message is not found', op: mira({ quote: EARLIER_MESSAGE }), expected: { side: 'card', reason: 'quote_not_found' } },
  { name: "a quote from the AI's own reply is not found", op: mira({ quote: AI_REPLY }), expected: { side: 'card', reason: 'quote_not_found' } },
  { name: 'a paraphrase is not found', op: mira({ quote: 'Mira steals on the Saltgate docks' }), expected: { side: 'card', reason: 'quote_not_found' } },
  { name: 'an ellipsis-shortened quote is not found', op: mira({ quote: 'Mira is a thief ... docks' }), expected: { side: 'card', reason: 'quote_not_found' } },
  { name: 'a quote of two content words does not count', op: mira({ quote: 'Mira is a thief' }), expected: { side: 'card', reason: 'quote_not_found' } },
  {
    name: 'case, whitespace and typographic apostrophes are normalised',
    op: { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', quote: "KAEL the smith   owes Mira a debt he can't repay" },
    expected: { side: 'direct' },
  },
  { name: 'surrounding quote marks the model added are ignored', op: mira({ quote: `"${QUOTE}"` }), expected: { side: 'direct' } },
];

const TENTATIVE_CASES: Case[] = [
  { name: 'a quote from a question is tentative', op: mira({ quote: 'Mira have a sister in the court' }), expected: { side: 'card', reason: 'tentative' } },
  {
    name: 'a quote from a hedged sentence is tentative',
    op: { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', quote: 'Kael was once a soldier of the queen' },
    expected: { side: 'card', reason: 'tentative' },
  },
  { name: 'a quote negated earlier in its clause is tentative', op: mira({ quote: 'trust the harbour guild' }), expected: { side: 'card', reason: 'tentative' } },
  {
    name: 'a negation in an earlier clause leaves the quote stated',
    op: { op: 'entity.upsert', entityKey: 'aldo', type: 'character', name: 'Aldo', quote: 'he runs the Saltgate smuggling ring' },
    expected: { side: 'direct' },
  },
];

const NOVELTY_CASES: Case[] = [
  { name: 'a field that adds a word or two applies', op: mira({ body: 'Mira is a thief who works the Saltgate docks at night.', quote: QUOTE }), expected: { side: 'direct' } },
  { name: 'a field that invents more than the budget is a card', op: mira({ body: INVENTED, quote: QUOTE }), expected: { side: 'card', reason: 'novel_content' } },
  {
    name: "a field's current words count as the author's",
    op: mira({ body: `${INVENTED} She is a thief.`, quote: QUOTE }),
    existing: { 'entity:mira': { name: 'Mira', body: INVENTED } },
    expected: { side: 'direct' },
  },
  {
    name: 'notes handed in as vocabulary count as the author’s words',
    op: mira({ body: INVENTED, quote: QUOTE }),
    vocabulary: `${AUTHOR_MESSAGE}\n${INVENTED}`,
    expected: { side: 'direct' },
  },
  {
    name: 'a quote that states a goal cannot back a page that states an outcome',
    op: { op: 'bible_document.upsert', section: 'plot', slug: 'escalation-map', body: 'The tide-queen falls in volume two.', quote: 'unseat the tide-queen' },
    expected: { side: 'card', reason: 'always_card', rule: 'planner_only_page' },
  },
];

const ALLOWLIST_CASES: Case[] = [
  {
    name: 'a Story Bible page with a found quote applies',
    op: { op: 'bible_document.upsert', section: 'lore', slug: 'drowned-court', body: 'The tide-queen rules the Drowned Court.', quote: 'its goal is to unseat the tide-queen' },
    expected: { side: 'direct' },
  },
  {
    name: 'a planner-only page is always a card',
    op: { op: 'bible_document.upsert', section: 'project', slug: 'timeline', body: 'Volume two: the court drowns.', quote: 'its goal is to unseat the tide-queen' },
    expected: { side: 'card', reason: 'always_card', rule: 'planner_only_page' },
  },
  {
    name: 'a new volume with its title and goal applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', ordinal: 2, title: 'The Drowned Court', objective: 'Unseat the tide-queen', quote: VOLUME_QUOTE },
    expected: { side: 'direct' },
  },
  {
    name: 'renaming an existing volume applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', title: 'The Drowned Court', quote: VOLUME_QUOTE },
    existing: { 'volume:v2': { title: 'Untitled', ordinal: 2 } },
    expected: { side: 'direct' },
  },
  {
    name: 'reordering an existing volume is a card',
    op: { op: 'volume.upsert', volumeKey: 'v2', ordinal: 3, quote: VOLUME_QUOTE },
    existing: ['volume:v2'],
    expected: { side: 'card', reason: 'always_card', rule: 'volume_structure' },
  },
  {
    name: "a state on volume.upsert never gates the op — the op cannot set a volume's state",
    op: { op: 'volume.upsert', volumeKey: 'v2', state: 'goal_met', quote: VOLUME_QUOTE } as unknown as ChangeOp,
    existing: ['volume:v2'],
    expected: { side: 'direct' },
  },
  {
    name: "a volume's notes are a card",
    op: { op: 'volume.upsert', volumeKey: 'v2', body: 'Notes', quote: VOLUME_QUOTE },
    expected: { side: 'card', reason: 'always_card', rule: 'volume_structure' },
  },
  { name: 'a new secret the author stated applies', op: fact({ body: 'The Hollow Crown eats memories.', subjects: ['mira'], quote: CROWN_QUOTE }), expected: { side: 'direct' } },
  {
    name: "a new secret's writer note is a card",
    op: fact({ body: 'It eats memories.', writerNote: 'Hint at gaps.', quote: CROWN_QUOTE }),
    expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' },
  },
  {
    name: "a new secret's unlock is a card",
    op: fact({ body: 'It eats memories.', unlock: { all: [{ volume: 'v2' }] }, quote: CROWN_QUOTE }),
    expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' },
  },
  {
    name: "a new secret's reveal chapter is a card",
    op: fact({ body: 'It eats memories.', revealChapter: 9, quote: CROWN_QUOTE }),
    expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' },
  },
  {
    name: "a new secret's allowed clues are a card",
    op: fact({ body: 'It eats memories.', allowedClues: ['forgotten names'], quote: CROWN_QUOTE }),
    expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' },
  },
  {
    name: "changing an existing secret's truth is a card",
    op: fact({ body: 'It eats memories.', quote: CROWN_QUOTE }),
    existing: ['fact:crown'],
    expected: { side: 'card', reason: 'always_card', rule: 'secret_truth' },
  },
  {
    name: "changing an existing secret's terms is a card",
    op: fact({ terms: ['hollow crown'], quote: CROWN_QUOTE }),
    existing: ['fact:crown'],
    expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' },
  },
  {
    name: "naming an existing secret's subjects applies",
    op: fact({ subjects: ['mira'], quote: CROWN_QUOTE }),
    existing: ['fact:crown', 'entity:mira'],
    expected: { side: 'direct' },
  },
  {
    name: 'setting an empty premise applies',
    op: { op: 'premise.update', premise: 'A dock thief takes on a drowned court.', quote: QUOTE },
    existing: { premise: { premise: '' } },
    expected: { side: 'direct' },
  },
  {
    name: 'replacing a non-empty premise is a card',
    op: { op: 'premise.update', premise: 'A dock thief takes on a drowned court.', quote: QUOTE },
    existing: { premise: { premise: 'An older premise.' } },
    expected: { side: 'card', reason: 'always_card', rule: 'replaces_story' },
  },
  {
    name: 'replacing non-empty themes is a card',
    op: { op: 'premise.update', themes: ['debt'], quote: QUOTE },
    existing: { premise: { premise: '', themes: ['memory'] } },
    expected: { side: 'card', reason: 'always_card', rule: 'replaces_story' },
  },
  {
    name: 'a milestone is not on the allowlist',
    op: { op: 'milestone.upsert', milestoneKey: 'court_falls', label: 'The court falls', quote: QUOTE },
    expected: { side: 'card', reason: 'not_allowlisted' },
  },
];

const ALWAYS_CARD_CASES: Case[] = [
  { name: 'removing an entity is always a card', op: { op: 'entity.remove', entityKey: 'mira', quote: QUOTE }, expected: { side: 'card', reason: 'always_card', rule: 'removal' } },
  { name: 'removing a secret is always a card', op: { op: 'fact.remove', factKey: 'crown', quote: QUOTE }, expected: { side: 'card', reason: 'always_card', rule: 'removal' } },
  {
    name: "blanking an entity's filled field is a removal",
    op: mira({ notes: '', quote: QUOTE }),
    existing: { 'entity:mira': { name: 'Mira', notes: 'Old notes' } },
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: "clearing an existing secret's unlock is a removal",
    op: fact({ unlock: null, quote: CROWN_QUOTE }),
    existing: { 'fact:crown': { body: 'It eats memories.', unlock: { all: [{ volume: 'v2' }] } } },
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'emptying a filled premise is a removal',
    op: { op: 'premise.update', premise: '', quote: QUOTE },
    existing: { premise: { premise: 'An older premise.' } },
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'a chapter plan is always a card',
    op: { op: 'brief.update', chapter: 4, body: 'Mira robs the court.', quote: QUOTE },
    expected: { side: 'card', reason: 'always_card', rule: 'plan' },
  },
  { name: 'prose is always a card', op: { op: 'draft.update', chapter: 4, body: 'Mira ran.', quote: QUOTE }, expected: { side: 'card', reason: 'always_card', rule: 'prose' } },
  { name: 'finalize is always a card', op: { op: 'action.finalize', quote: QUOTE }, expected: { side: 'card', reason: 'always_card', rule: 'action' } },
  { name: 'approval is always a card', op: { op: 'action.approve_draft', chapter: 4, quote: QUOTE }, expected: { side: 'card', reason: 'always_card', rule: 'action' } },
  {
    name: 'goal met — start next is always a card',
    op: { op: 'action.advance_volume', volumeKey: 'v1', quote: QUOTE },
    expected: { side: 'card', reason: 'always_card', rule: 'action' },
  },
];

const OVERRIDE_CASES: Case[] = [
  { name: 'a manual-mode chat applies nothing on its own', op: mira({ quote: QUOTE }), mode: 'manual', expected: { side: 'card', reason: 'manual_mode' } },
  { name: 'a turn warning holds a quote-backed op for review', op: mira({ quote: QUOTE }), held: true, expected: { side: 'card', reason: 'held_for_review' } },
  { name: 'just discussing turns a quote-backed op into a card', op: mira({ quote: QUOTE }), justDiscussing: true, expected: { side: 'card', reason: 'just_discussing' } },
  {
    name: 'just discussing outranks manual mode and a hold',
    op: mira({ quote: QUOTE }),
    justDiscussing: true,
    mode: 'manual',
    held: true,
    expected: { side: 'card', reason: 'just_discussing' },
  },
  { name: 'manual mode outranks a hold', op: mira({ quote: QUOTE }), mode: 'manual', held: true, expected: { side: 'card', reason: 'manual_mode' } },
  { name: 'just discussing keeps the reason of an op that was a card anyway', op: mira(), justDiscussing: true, expected: { side: 'card', reason: 'no_quote' } },
];

const TABLES: [string, Case[]][] = [
  ['the quote', QUOTE_CASES],
  ['a tentative quote', TENTATIVE_CASES],
  ['the novelty budget', NOVELTY_CASES],
  ['the allowlist', ALLOWLIST_CASES],
  ['always-card rules', ALWAYS_CARD_CASES],
  ['turn overrides', OVERRIDE_CASES],
];

for (const [table, cases] of TABLES) {
  describe(`splitChangeSet — ${table}`, () => {
    for (const testCase of cases) {
      it(`should decide that ${testCase.name}`, () => {
        const split = policy([testCase.op], testCase);

        expect(split.dispositions).toEqual([{ index: 0, ...testCase.expected }]);
        expect(testCase.expected.side === 'direct' ? split.direct : split.cards).toEqual([testCase.op]);
      });
    }
  });
}

describe('splitChangeSet — the hold flag', () => {
  it('should flag the hold only when it turned an op that would have applied into a card', () => {
    expect(policy([mira({ quote: QUOTE })], { held: true }).held).toBe(true);
    expect(policy([mira()], { held: true }).held).toBe(false);
    expect(policy([mira({ quote: QUOTE })], { held: true, justDiscussing: true }).held).toBe(false);
  });
});

interface DependencyCase {
  name: string;
  ops: ChangeOp[];
  existing?: string[];
  expected: Expected[];
}

const kael = (fields: Partial<Extract<ChangeOp, { op: 'entity.upsert' }>> = {}): ChangeOp => ({
  op: 'entity.upsert',
  entityKey: 'kael',
  type: 'character',
  name: 'Kael',
  ...fields,
});
const aldo = (fields: Partial<Extract<ChangeOp, { op: 'entity.upsert' }>> = {}): ChangeOp => ({
  op: 'entity.upsert',
  entityKey: 'aldo',
  type: 'character',
  name: 'Aldo',
  ...fields,
});
const KAEL_QUOTE = 'Kael the smith owes Mira a debt';

const DEPENDENCY_CASES: DependencyCase[] = [
  {
    name: 'a quoted secret naming a character only a card creates joins the card',
    ops: [mira(), fact({ body: 'It eats memories.', subjects: ['mira'], quote: CROWN_QUOTE })],
    expected: [
      { side: 'card', reason: 'no_quote' },
      { side: 'card', reason: 'depends_on_card' },
    ],
  },
  {
    name: 'the move holds whichever way round the ops are listed',
    ops: [fact({ body: 'It eats memories.', subjects: ['mira'], quote: CROWN_QUOTE }), mira()],
    expected: [
      { side: 'card', reason: 'depends_on_card' },
      { side: 'card', reason: 'no_quote' },
    ],
  },
  {
    name: 'the move is transitive through a record the moved op creates, whatever the listing order',
    ops: [
      aldo(),
      fact({ factKey: 'ring', terms: ['smuggling ring'], quote: CROWN_QUOTE }),
      fact({ factKey: 'ring', body: 'The Hollow Crown is a relic.', subjects: ['aldo'], quote: CROWN_QUOTE }),
    ],
    expected: [
      { side: 'card', reason: 'no_quote' },
      { side: 'card', reason: 'depends_on_card' },
      { side: 'card', reason: 'depends_on_card' },
    ],
  },
  {
    name: 'a quoted op writing the new record a card creates joins the card',
    ops: [mira({ body: 'An invented backstory.' }), mira({ status: 'thief', quote: QUOTE })],
    expected: [
      { side: 'card', reason: 'no_quote' },
      { side: 'card', reason: 'depends_on_card' },
    ],
  },
  {
    name: 'ops on a record that already exists split independently',
    ops: [mira({ body: 'An invented backstory.' }), mira({ status: 'thief', quote: QUOTE })],
    existing: ['entity:mira'],
    expected: [{ side: 'card', reason: 'no_quote' }, { side: 'direct' }],
  },
  {
    name: 'a card naming a record the applied side creates stays a card, and the applied op stays applied',
    ops: [kael({ quote: KAEL_QUOTE }), { op: 'brief.update', chapter: 5, pov: 'kael', body: 'Kael forges the key.' }],
    expected: [{ side: 'direct' }, { side: 'card', reason: 'always_card', rule: 'plan' }],
  },
  {
    name: 'a quoted secret naming a character the applied side creates stays applied',
    ops: [kael({ quote: KAEL_QUOTE }), fact({ body: 'It eats memories.', subjects: ['kael'], quote: CROWN_QUOTE })],
    expected: [{ side: 'direct' }, { side: 'direct' }],
  },
  {
    name: 'a quoted page that owes records only a card supplies joins the card',
    ops: [{ op: 'bible_document.upsert', section: 'project', slug: 'cast', body: 'Mira, a dock thief.', quote: QUOTE }, mira({ body: 'Invented detail.' })],
    existing: ['entity:mira'],
    expected: [
      { side: 'card', reason: 'depends_on_card' },
      { side: 'card', reason: 'no_quote' },
    ],
  },
  {
    name: 'a quoted page whose owed records apply beside it stays applied',
    ops: [{ op: 'bible_document.upsert', section: 'project', slug: 'cast', body: 'Mira, a dock thief.', quote: QUOTE }, mira({ quote: QUOTE }), kael()],
    expected: [{ side: 'direct' }, { side: 'direct' }, { side: 'card', reason: 'no_quote' }],
  },
];

describe('splitChangeSet — dependency split', () => {
  for (const testCase of DEPENDENCY_CASES) {
    it(`should find that ${testCase.name}`, () => {
      const split = policy(testCase.ops, { existing: testCase.existing });

      expect(split.dispositions).toEqual(testCase.expected.map((expected, index) => ({ index, ...expected })));
      expect([...split.direct, ...split.cards]).toHaveLength(testCase.ops.length);
    });
  }

  it('should keep both sides in the order the ops were listed', () => {
    const ops: ChangeOp[] = [kael(), mira({ quote: QUOTE }), { op: 'entity.remove', entityKey: 'aldo' }, kael({ entityKey: 'kael2', quote: KAEL_QUOTE })];
    const split = policy(ops);

    expect(split.direct).toEqual([ops[1], ops[3]] as ChangeOp[]);
    expect(split.cards).toEqual([ops[0], ops[2]] as ChangeOp[]);
    expect(split.ops).toEqual(ops);
  });

  it('should read a plan’s cited Story Bible page as the ref a change-set writes', () => {
    expect(opReferences({ op: 'brief.update', chapter: 3, contextRefs: ['bible_doc:world/saltgate', 'entity:mira'] })).toEqual(['doc:world/saltgate', 'entity:mira']);
  });
});

describe('quote checks', () => {
  it('should match only verbatim text of the given message, after normalisation', () => {
    expect(quoteFoundIn('works the  SALTGATE docks', AUTHOR_MESSAGE)).toBe(true);
    expect(quoteFoundIn('works the Saltgate harbour', AUTHOR_MESSAGE)).toBe(false);
    expect(quoteFoundIn(EARLIER_MESSAGE, AUTHOR_MESSAGE)).toBe(false);
  });

  it('should read an unhedged statement as stated', () => {
    expect(quoteIsTentative(QUOTE, AUTHOR_MESSAGE)).toBe(false);
    expect(quoteIsTentative('unseat the tide-queen', AUTHOR_MESSAGE)).toBe(false);
  });

  it('should allow max(4, 25%) new content words across the whole op and refuse one more', () => {
    const known = Array.from({ length: 30 }, (_, i) => `kw${i}`).join(' ');
    const novel = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `nv${from + i}`).join(' ');
    const op = (fields: Record<string, string>): ChangeOp => ({ op: 'entity.upsert', entityKey: 'x', type: 'concept', ...fields });

    expect(exceedsNoveltyBudget(op({ body: `${known} ${novel(10)}` }), undefined, known)).toBe(false);
    expect(exceedsNoveltyBudget(op({ body: `${known} ${novel(11)}` }), undefined, known)).toBe(true);
    expect(exceedsNoveltyBudget(op({ body: novel(4) }), undefined, '')).toBe(false);
    expect(exceedsNoveltyBudget(op({ body: novel(5) }), undefined, '')).toBe(true);
    expect(exceedsNoveltyBudget(op({ status: novel(3), notes: novel(3, 3) }), undefined, '')).toBe(true);
  });

  it('should allow a field to drop max(4, 25%) of its existing content words and refuse one more', () => {
    const words = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `ew${from + i}`).join(' ');
    const op = (body: string): ChangeOp => ({ op: 'entity.upsert', entityKey: 'x', type: 'concept', body });

    expect(exceedsRemovalBudget(op(words(15, 5)), { body: words(20) })).toBe(false);
    expect(exceedsRemovalBudget(op(words(14, 6)), { body: words(20) })).toBe(true);
    expect(exceedsRemovalBudget(op(words(4, 4)), { body: words(8) })).toBe(false);
    expect(exceedsRemovalBudget(op(words(3, 5)), { body: words(8) })).toBe(true);
    expect(exceedsRemovalBudget(op(words(2)), undefined)).toBe(false);
  });
});

describe('just discussing and quotes in the prompt', () => {
  it('should tell the model the turn only makes cards, and say nothing of it otherwise', () => {
    expect(renderTurnRules({ proseEdits: false, justDiscussing: true })).toContain('becomes a suggestion card');
    expect(renderTurnRules({ proseEdits: false })).not.toContain('Just discussing');
  });

  it('should offer quote in the chat playbook only, and accept it on any op', () => {
    expect(HUB_INSTRUCTIONS).toContain('"quote": <string, optional>');
    expect(renderOpVocabulary(['premise.update'])).not.toContain('quote');
    expect(validateChangeSet([mira({ quote: QUOTE })])).toEqual([]);
    expect(validateChangeSet([mira({ quote: 7 as never })])).toEqual(["changeSet[0]: invalid field 'quote' (expected string)"]);
  });
});

const LAUNDER_MESSAGE = "Mira is a thief who works the docks. Maybe she's secretly the queen's spy.";
const PROBE_MESSAGE = 'Kael is a dock thief with a scar. Kael is left-handed. Mira hates boats. Volume two is called The Drowned Court.';
const SALTGATE_PAGE =
  'The Saltgate docks never sleep. Smugglers trade salt for silver under the lamps. The harbour guild taxes every crate twice. Its masters answer only to the tide-queen.';
const KAEL_PROBE = 'Kael is a dock thief with a scar';
const kaelOp = (fields: Partial<Extract<ChangeOp, { op: 'entity.upsert' }>>): ChangeOp => ({ op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', ...fields });
const saltgate = (body: string): ChangeOp => ({ op: 'bible_document.upsert', section: 'lore', slug: 'saltgate', body, quote: QUOTE });

const CONTENT_CASES: Case[] = [
  {
    name: 'words from a hedged sentence cannot ride on a quote from a stated one',
    op: mira({ body: "A dock thief, secretly the queen's spy", quote: 'Mira is a thief who works the docks' }),
    message: LAUNDER_MESSAGE,
    expected: { side: 'card', reason: 'tentative' },
  },
  {
    name: 'the stated sentence alone still applies beside a hedged one',
    op: mira({ body: 'A thief who works the docks.', quote: 'Mira is a thief who works the docks' }),
    message: LAUNDER_MESSAGE,
    expected: { side: 'direct' },
  },
  {
    name: 'a four-sentence page re-emitted as two sentences is a removal',
    op: saltgate('The Saltgate docks never sleep. Smugglers trade salt for silver under the lamps.'),
    existing: { 'doc:lore/saltgate': { body: SALTGATE_PAGE } },
    expected: { side: 'card', reason: 'removal' },
  },
  {
    name: 'a one-sentence page addition applies',
    op: saltgate(`${SALTGATE_PAGE} Mira is a thief who works the docks.`),
    existing: { 'doc:lore/saltgate': { body: SALTGATE_PAGE } },
    expected: { side: 'direct' },
  },
  {
    name: 'an invented motivation beside a stated scar is new content',
    op: kaelOp({ motivation: 'Revenge on the harbour master who cut him and sold his sister.', quote: KAEL_PROBE }),
    message: PROBE_MESSAGE,
    expected: { side: 'card', reason: 'novel_content' },
  },
  {
    name: 'an embellished scar note is new content',
    op: kaelOp({ notes: 'A scar from a knife fight in the Saltgate markets, still aching in the cold.', quote: KAEL_PROBE }),
    message: PROBE_MESSAGE,
    expected: { side: 'card', reason: 'novel_content' },
  },
  {
    name: 'a page adding exactly eight new words is new content',
    op: {
      op: 'bible_document.upsert',
      section: 'lore',
      slug: 'kael',
      body: 'Kael is a dock thief with a scar. He grew up hauling nets beside rusted trawlers near breakwaters.',
      quote: KAEL_PROBE,
    },
    message: PROBE_MESSAGE,
    expected: { side: 'card', reason: 'novel_content' },
  },
  { name: 'recording left-handedness applies', op: kaelOp({ notes: 'Left-handed.', quote: 'Kael is left-handed' }), message: PROBE_MESSAGE, expected: { side: 'direct' } },
  { name: 'recording a hatred of boats applies', op: mira({ motivation: 'Hates boats.', quote: 'Mira hates boats' }), message: PROBE_MESSAGE, expected: { side: 'direct' } },
  {
    name: 'renaming a volume applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', title: 'The Drowned Court', quote: VOLUME_QUOTE },
    message: PROBE_MESSAGE,
    existing: { 'volume:v2': { title: 'Untitled' } },
    expected: { side: 'direct' },
  },
];

const DOCKS = 'Mira grew up on the docks';
const cue = (name: string, message: string, side: OpSide = 'card'): Case => ({
  name,
  op: mira({ quote: DOCKS }),
  message,
  expected: side === 'card' ? { side, reason: 'tentative' } : { side },
});

const CUE_CASES: Case[] = [
  cue('"perhaps" hedges', 'Perhaps Mira grew up on the docks.'),
  cue('"wonder" hedges', 'I wonder if Mira grew up on the docks.'),
  cue('"whether" hedges', 'Decide whether Mira grew up on the docks.'),
  cue('"suppose" hedges', 'Suppose Mira grew up on the docks.'),
  cue('"imagine" hedges', 'Imagine Mira grew up on the docks.'),
  cue('"probably" hedges', 'Probably Mira grew up on the docks.'),
  cue('"possibly" hedges', 'Possibly Mira grew up on the docks.'),
  cue('"if" hedges', 'If Mira grew up on the docks, she knows the tides.'),
  cue('"bad idea" after the quote turns it down', 'Mira grew up on the docks - bad idea.'),
  cue('"terrible idea" after the quote turns it down', 'Mira grew up on the docks, terrible idea.'),
  cue('"no way" after the quote turns it down', 'Mira grew up on the docks? No, no way.'),
  cue('"scrap" after the quote turns it down', 'Mira grew up on the docks; scrap it.'),
  cue('"drop that" after the quote turns it down', 'Mira grew up on the docks, drop that.'),
  cue('"instead" after the quote turns it down', 'Mira grew up on the docks, make it the palace instead.'),
  cue('"instead" before the quote states it', 'Instead, Mira grew up on the docks.', 'direct'),
  cue('a question inside closing quotes is still a question', 'She asked: "Mira grew up on the docks?" Then she left.'),
  cue('a sentence ends after closing quotes, so the next question is its own', 'She said "Mira grew up on the docks." Then she asked why?', 'direct'),
];

const CJK_CASES: Case[] = [
  {
    name: 'a CJK quote the author stated applies',
    op: mira({ name: '米拉', body: '码头上的小偷', quote: '米拉是码头上的小偷' }),
    message: '米拉是码头上的小偷。她讨厌船。',
    expected: { side: 'direct' },
  },
  {
    name: 'a CJK quote from a hedged question is tentative',
    op: mira({ name: '米拉', quote: '她是女王的间谍' }),
    message: '米拉是码头上的小偷。也许她是女王的间谍？',
    expected: { side: 'card', reason: 'tentative' },
  },
  {
    name: 'a CJK quote of a single word does not count',
    op: mira({ name: '米拉', quote: '小偷' }),
    message: '米拉是码头上的小偷。',
    expected: { side: 'card', reason: 'quote_not_found' },
  },
];

for (const [table, cases] of [
  ['content checks', CONTENT_CASES],
  ['tentative cues', CUE_CASES],
  ['scripts without spaces', CJK_CASES],
] as [string, Case[]][]) {
  describe(`splitChangeSet — ${table}`, () => {
    for (const testCase of cases) {
      it(`should decide that ${testCase.name}`, () => {
        expect(policy([testCase.op], testCase).dispositions).toEqual([{ index: 0, ...testCase.expected }]);
      });
    }
  });
}
