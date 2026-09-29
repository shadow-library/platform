import { describe, expect, it } from 'bun:test';

import { renderTurnRules } from '@modules/ai/prompts/chat-refine.prompt';
import { HUB_INSTRUCTIONS } from '@modules/ai/prompts/scope-playbooks';
import { type RecordFields } from '@modules/refinement/artifact-state';
import { type ChangeOp, renderOpVocabulary, validateChangeSet } from '@modules/refinement/change-set';
import {
  type CardDisposition,
  type DirectDisposition,
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
  ideas?: WritePolicyInput['ideas'];
  held?: boolean;
  justDiscussing?: boolean;
  vocabulary?: string;
  message?: string;
}

function policy(ops: ChangeOp[], options: PolicyOptions = {}) {
  const { existing = [], mode = 'auto', ideas = 'card', held = false, justDiscussing, vocabulary, message = AUTHOR_MESSAGE } = options;
  const entries: [string, RecordFields][] = Array.isArray(existing) ? existing.map(ref => [ref, {}]) : Object.entries(existing);
  return splitChangeSet({ ops, authorMessage: message, vocabulary, mode, ideas, held, justDiscussing, state: { current: new Map(entries) } });
}

type Expected = Omit<DirectDisposition, 'index'> | Omit<CardDisposition, 'index'>;

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
  { name: 'an entity whose quote is in the message applies', op: mira({ quote: QUOTE }), expected: { side: 'direct', source: 'quoted' } },
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
    expected: { side: 'direct', source: 'quoted' },
  },
  { name: 'surrounding quote marks the model added are ignored', op: mira({ quote: `"${QUOTE}"` }), expected: { side: 'direct', source: 'quoted' } },
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
    expected: { side: 'direct', source: 'quoted' },
  },
];

const NOVELTY_CASES: Case[] = [
  {
    name: 'a field that adds a word or two applies',
    op: mira({ body: 'Mira is a thief who works the Saltgate docks at night.', quote: QUOTE }),
    expected: { side: 'direct', source: 'quoted' },
  },
  { name: 'a field that invents more than the budget is a card', op: mira({ body: INVENTED, quote: QUOTE }), expected: { side: 'card', reason: 'novel_content' } },
  {
    name: "a field's current words count as the author's",
    op: mira({ body: `${INVENTED} She is a thief.`, quote: QUOTE }),
    existing: { 'entity:mira': { name: 'Mira', body: INVENTED } },
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'notes handed in as vocabulary count as the author’s words',
    op: mira({ body: INVENTED, quote: QUOTE }),
    vocabulary: `${AUTHOR_MESSAGE}\n${INVENTED}`,
    expected: { side: 'direct', source: 'quoted' },
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
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'a planner-only page is always a card',
    op: { op: 'bible_document.upsert', section: 'project', slug: 'timeline', body: 'Volume two: the court drowns.', quote: 'its goal is to unseat the tide-queen' },
    expected: { side: 'card', reason: 'always_card', rule: 'planner_only_page' },
  },
  {
    name: 'a new volume with its title and goal applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', ordinal: 2, title: 'The Drowned Court', objective: 'Unseat the tide-queen', quote: VOLUME_QUOTE },
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'renaming an existing volume applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', title: 'The Drowned Court', quote: VOLUME_QUOTE },
    existing: { 'volume:v2': { title: 'Untitled', ordinal: 2 } },
    expected: { side: 'direct', source: 'quoted' },
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
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: "a volume's notes are a card",
    op: { op: 'volume.upsert', volumeKey: 'v2', body: 'Notes', quote: VOLUME_QUOTE },
    expected: { side: 'card', reason: 'always_card', rule: 'volume_structure' },
  },
  {
    name: 'a new secret the author stated applies',
    op: fact({ body: 'The Hollow Crown eats memories.', subjects: ['mira'], quote: CROWN_QUOTE }),
    expected: { side: 'direct', source: 'quoted' },
  },
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
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'setting an empty premise applies',
    op: { op: 'premise.update', premise: 'A dock thief takes on a drowned court.', quote: QUOTE },
    existing: { premise: { premise: '' } },
    expected: { side: 'direct', source: 'quoted' },
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

const PROMISE_MESSAGE = 'Mira swore to find who took the ledger, and she means to see it paid off.';

const PROMISE_CASES: Case[] = [
  {
    name: 'a new promise the author stated applies',
    op: { op: 'promise.create', kind: 'thread', key: 'ledger', label: 'Who took the ledger', quote: 'Mira swore to find who took the ledger' },
    message: PROMISE_MESSAGE,
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'rewording an existing promise applies',
    op: { op: 'promise.update', kind: 'thread', key: 'ledger', label: 'she means to see it paid off', quote: 'she means to see it paid off' },
    existing: ['promise:thread:ledger'],
    message: PROMISE_MESSAGE,
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'closing a promise as paid off is always a card',
    op: { op: 'promise.update', kind: 'thread', key: 'ledger', status: 'paid_off', quote: 'she means to see it paid off' },
    existing: ['promise:thread:ledger'],
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_disposition' },
  },
  {
    name: "setting a payoff target is the promise's disposition, always a card",
    op: { op: 'promise.set_payoff', kind: 'thread', key: 'ledger', payoffMilestoneKey: 'reveal_thief', quote: 'she means to see it paid off' },
    existing: ['promise:thread:ledger'],
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_disposition' },
  },
  {
    name: 'someday over a filled payoff target is a removal',
    op: { op: 'promise.set_payoff', kind: 'thread', key: 'ledger', someday: true, quote: 'she means to see it paid off' },
    existing: { 'promise:thread:ledger': { label: 'Who took the ledger', status: 'open', payoffMilestoneKey: 'reveal_thief', payoffVolumeKey: null, payoffWindow: null } },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'clearing a filled payoff window is a removal',
    op: { op: 'promise.set_payoff', kind: 'thread', key: 'ledger', payoffWindow: null, quote: 'she means to see it paid off' },
    existing: { 'promise:thread:ledger': { label: 'Who took the ledger', status: 'open', payoffWindow: 12 } },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'someday on a promise with no payoff target is only its disposition',
    op: { op: 'promise.set_payoff', kind: 'thread', key: 'ledger', someday: true, quote: 'she means to see it paid off' },
    existing: { 'promise:thread:ledger': { label: 'Who took the ledger', status: 'open', payoffMilestoneKey: null, payoffVolumeKey: null, payoffWindow: null } },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_disposition' },
  },
  {
    name: 'dropping a promise is always a card',
    op: { op: 'promise.drop', kind: 'thread', key: 'ledger', quote: 'she means to see it paid off' },
    existing: ['promise:thread:ledger'],
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'recording progress on a promise is always a card',
    op: { op: 'promise.update', kind: 'thread', key: 'ledger', lastAdvancedChapter: 4, quote: 'she means to see it paid off' },
    existing: ['promise:thread:ledger'],
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_progress' },
  },
  {
    name: 'creating over a dropped promise key is a card, not a hard failure',
    op: { op: 'promise.create', kind: 'thread', key: 'ledger', label: 'Who took the ledger', quote: 'Mira swore to find who took the ledger' },
    existing: { 'promise:thread:ledger': { label: 'Old ledger promise', status: 'dropped' } },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_reuse' },
  },
  {
    name: 'creating over a closed promise key is a card, not a hard failure',
    op: { op: 'promise.create', kind: 'thread', key: 'ledger', label: 'Who took the ledger', quote: 'Mira swore to find who took the ledger' },
    existing: { 'promise:thread:ledger': { label: 'Old ledger promise', status: 'closed' } },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'always_card', rule: 'promise_reuse' },
  },
  {
    // P4-41 probe: a plain, already-stated key ('ledger') never needed the key-laundering exemption in the first place — the label's own
    // words are already in the author's message, so the fix changes nothing here.
    name: 'P4-41 probe: a plain key like "ledger" still applies once its label is otherwise stated',
    op: { op: 'promise.create', kind: 'thread', key: 'ledger', label: 'Who took the ledger', quote: 'Mira swore to find who took the ledger' },
    message: PROMISE_MESSAGE,
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    // P4-41 probe: before the fix, a long descriptive key's own words were exempt from the novelty budget on create, so a model could smuggle
    // an unstated secret into the key and repeat it in the label for free. The key no longer launders that content.
    name: 'P4-41 probe: a long descriptive key no longer launders its words into the label on create',
    op: {
      op: 'promise.create',
      kind: 'thread',
      key: 'mira-secretly-serves-the-tide-queen-as-a-spy',
      label: 'Mira secretly serves the tide-queen as a spy',
      quote: 'she means to see it paid off',
    },
    message: PROMISE_MESSAGE,
    expected: { side: 'card', reason: 'novel_content' },
  },
];

const QUOTE_RULE: WritePolicyInput['ideas'][] = ['card'];
const EITHER: WritePolicyInput['ideas'][] = ['card', 'apply'];
const TABLES: [string, Case[], WritePolicyInput['ideas'][]][] = [
  ['the quote', QUOTE_CASES, QUOTE_RULE],
  ['a tentative quote', TENTATIVE_CASES, QUOTE_RULE],
  ['the novelty budget', NOVELTY_CASES, QUOTE_RULE],
  ['the allowlist', ALLOWLIST_CASES, QUOTE_RULE],
  ['always-card rules', ALWAYS_CARD_CASES, EITHER],
  ['turn overrides', OVERRIDE_CASES, EITHER],
  ['promises', PROMISE_CASES, QUOTE_RULE],
];

for (const [table, cases, modes] of TABLES) {
  describe(`splitChangeSet — ${table}`, () => {
    for (const testCase of cases.flatMap(each => modes.map(ideas => ({ ...each, ideas })))) {
      it(`should decide that ${testCase.name}${testCase.ideas === 'apply' ? ', even when ideas apply' : ''}`, () => {
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

const EDIT_FREELY_CASES: Case[] = [
  { name: 'an invented entity applies as an idea', op: mira({ body: INVENTED }), expected: { side: 'direct', source: 'idea' } },
  { name: 'an entity the author worded applies as quoted', op: mira({ quote: QUOTE }), expected: { side: 'direct', source: 'quoted' } },
  { name: 'a quote the author never wrote applies as an idea', op: mira({ quote: AI_REPLY }), expected: { side: 'direct', source: 'idea' } },
  { name: 'a quote from a question applies as an idea', op: mira({ quote: 'Mira have a sister in the court' }), expected: { side: 'direct', source: 'idea' } },
  { name: 'a quoted op past the novelty budget applies as an idea', op: mira({ body: INVENTED, quote: QUOTE }), expected: { side: 'direct', source: 'idea' } },
  {
    name: 'a kind off the allowlist applies as an idea',
    op: { op: 'milestone.upsert', milestoneKey: 'heist', label: 'The heist on the court' },
    expected: { side: 'direct', source: 'idea' },
  },
  {
    name: 'an idea that truncates what a field held stays a card',
    op: mira({ body: 'A thief.' }),
    existing: { 'entity:mira': { name: 'Mira', body: INVENTED } },
    expected: { side: 'card', reason: 'removal' },
  },
  { name: 'an unquoted removal stays a card', op: { op: 'entity.remove', entityKey: 'mira' }, expected: { side: 'card', reason: 'always_card', rule: 'removal' } },
  { name: 'an unquoted plan stays a card', op: { op: 'brief.update', chapter: 4, body: 'Mira robs the court.' }, expected: { side: 'card', reason: 'always_card', rule: 'plan' } },
  { name: 'unquoted prose stays a card', op: { op: 'draft.update', chapter: 4, body: 'Mira ran.' }, expected: { side: 'card', reason: 'always_card', rule: 'prose' } },
  { name: 'finalize stays a card', op: { op: 'action.finalize' }, expected: { side: 'card', reason: 'always_card', rule: 'action' } },
  { name: 'approval stays a card', op: { op: 'action.approve_draft', chapter: 4 }, expected: { side: 'card', reason: 'always_card', rule: 'action' } },
  { name: 'generating a chapter stays a card', op: { op: 'action.generate_chapter', chapter: 4 }, expected: { side: 'card', reason: 'always_card', rule: 'action' } },
  {
    name: "rewriting a secret's truth stays a card",
    op: fact({ body: 'It eats names.' }),
    existing: { 'fact:crown': { body: 'It eats memories.' } },
    expected: { side: 'card', reason: 'always_card', rule: 'secret_truth' },
  },
  { name: 'gating a secret stays a card', op: fact({ body: 'It eats memories.', revealChapter: 9 }), expected: { side: 'card', reason: 'always_card', rule: 'secret_gating' } },
  {
    name: "a new secret's invented truth stays a card",
    op: fact({ body: 'It eats memories.' }),
    expected: { side: 'card', reason: 'no_quote', rule: 'secret_truth' },
  },
  {
    name: 'a new secret quoted from the AI stays a card',
    op: fact({ body: 'It eats memories.', subjects: ['mira'], quote: AI_REPLY }),
    existing: ['entity:mira'],
    expected: { side: 'card', reason: 'quote_not_found', rule: 'secret_truth' },
  },
  {
    name: "an invented secret's subjects stay a card",
    op: fact({ subjects: ['mira'] }),
    existing: ['fact:crown', 'entity:mira'],
    expected: { side: 'card', reason: 'no_quote', rule: 'secret_truth' },
  },
  {
    name: 'a new secret the author stated still applies as quoted',
    op: fact({ body: 'The Hollow Crown eats memories.', subjects: ['mira'], quote: CROWN_QUOTE }),
    existing: ['entity:mira'],
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'an invented volume goal stays a card, since it is planner-only',
    op: { op: 'volume.upsert', volumeKey: 'v3', title: 'The Salt Road', objective: 'Crown Mira' },
    expected: { side: 'card', reason: 'no_quote', rule: 'planner_only_field' },
  },
  { name: 'an invented volume title applies as an idea', op: { op: 'volume.upsert', volumeKey: 'v3', title: 'The Salt Road' }, expected: { side: 'direct', source: 'idea' } },
  {
    name: 'an invented premise for an empty story applies as an idea',
    op: { op: 'premise.update', premise: INVENTED },
    existing: { premise: { premise: '' } },
    expected: { side: 'direct', source: 'idea' },
  },
  {
    name: 'rewording a promise applies as an idea',
    op: { op: 'promise.update', kind: 'thread', key: 'ledger', label: 'Who stole the harbour ledger' },
    existing: { 'promise:thread:ledger': { label: 'Who took the ledger', status: 'open' } },
    expected: { side: 'direct', source: 'idea' },
  },
  {
    name: 'an invented payoff target stays a card',
    op: { op: 'promise.set_payoff', kind: 'thread', key: 'ledger', payoffVolumeKey: 'v2' },
    existing: ['promise:thread:ledger'],
    expected: { side: 'card', reason: 'always_card', rule: 'promise_disposition' },
  },
  {
    name: 'an invented someday over a filled payoff target stays a removal card',
    op: { op: 'promise.set_payoff', kind: 'mystery', key: 'crown', someday: true, dormant: true },
    existing: { 'promise:mystery:crown': { label: 'Who forged the crown?', status: 'open', payoffVolumeKey: 'v2' } },
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  {
    name: 'an invented rule stays a card',
    op: { op: 'organise.rule', rule: 'Mira never kills.', optionId: 'r1' },
    expected: { side: 'card', reason: 'not_allowlisted', rule: 'notebook_direction' },
  },
  {
    name: 'a wholesale relabel of a milestone stays a card',
    op: { op: 'milestone.upsert', milestoneKey: 'heist', label: 'Kael betrays the smiths' },
    existing: { 'milestone:heist': { label: 'Mira robs the tide-queen’s vault beneath the drowned court', kind: 'event' } },
    expected: { side: 'card', reason: 'removal' },
  },
  {
    name: "clearing a milestone's subject is a removal",
    op: { op: 'milestone.upsert', milestoneKey: 'heist', subjectEntityKey: null },
    existing: { 'milestone:heist': { label: 'The heist', subjectEntityKey: 'mira', kind: 'event' } },
    expected: { side: 'card', reason: 'always_card', rule: 'removal' },
  },
  { name: 'a manual-mode chat keeps an idea a card', op: mira({ body: INVENTED }), mode: 'manual', expected: { side: 'card', reason: 'no_quote' } },
  { name: 'just discussing keeps an idea a card', op: mira({ body: INVENTED }), justDiscussing: true, expected: { side: 'card', reason: 'no_quote' } },
  { name: 'a held turn keeps an idea a card', op: mira({ body: INVENTED }), held: true, expected: { side: 'card', reason: 'no_quote' } },
];

describe('splitChangeSet — Edit freely', () => {
  for (const testCase of EDIT_FREELY_CASES) {
    it(`should decide that ${testCase.name}`, () => {
      const split = policy([testCase.op], { ...testCase, ideas: 'apply' });

      expect(split.dispositions).toEqual([{ index: 0, ...testCase.expected }]);
      expect(split.sources).toEqual(testCase.expected.side === 'direct' ? [testCase.expected.source] : []);
    });
  }

  it('should apply no idea unless the caller opts in', () => {
    const split = splitChangeSet({ ops: [mira({ body: INVENTED })], authorMessage: AUTHOR_MESSAGE, mode: 'auto', held: false, state: { current: new Map() } });

    expect(split.dispositions).toEqual([{ index: 0, side: 'card', reason: 'no_quote' }]);
  });

  it('should flag a hold that kept an idea off the applied side', () => {
    const split = policy([mira({ body: INVENTED })], { ideas: 'apply', held: true });

    expect(split.held).toBe(true);
    expect(split.dispositions).toEqual([{ index: 0, side: 'card', reason: 'no_quote' }]);
  });

  it('should not flag a hold when the ideas would not have applied anyway or the turn is manual or just discussing', () => {
    expect(policy([{ op: 'entity.remove', entityKey: 'aldo' }], { ideas: 'apply', held: true }).held).toBe(false);
    expect(policy([mira({ body: INVENTED })], { ideas: 'apply', held: true, mode: 'manual' }).held).toBe(false);
    expect(policy([mira({ body: INVENTED })], { ideas: 'apply', held: true, justDiscussing: true }).held).toBe(false);
  });

  it('should send an idea naming a record only a card creates to the cards, keeping the quote rule’s reason so a turned-down idea is still filtered', () => {
    const ops: ChangeOp[] = [
      { op: 'volume.upsert', volumeKey: 'v9', title: 'The Drowned Court', body: 'The court floods.' },
      { op: 'volume.upsert', volumeKey: 'v9', ordinal: 9 },
      mira({ quote: QUOTE }),
    ];

    const split = policy(ops, { ideas: 'apply' });

    expect(split.dispositions).toEqual([
      { index: 0, side: 'card', reason: 'always_card', rule: 'volume_structure' },
      { index: 1, side: 'card', reason: 'no_quote' },
      { index: 2, side: 'direct', source: 'quoted' },
    ]);
    expect(split.sources).toEqual(['quoted']);
  });

  it('should align each applied op’s source with the applied side in listing order', () => {
    const ops: ChangeOp[] = [
      { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', body: 'Kael the smith.' },
      mira({ quote: QUOTE }),
      { op: 'entity.remove', entityKey: 'aldo' },
    ];

    const split = policy(ops, { ideas: 'apply' });

    expect(split.direct).toEqual([ops[0], ops[1]] as ChangeOp[]);
    expect(split.sources).toEqual(['idea', 'quoted']);
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
    expected: [
      { side: 'card', reason: 'no_quote' },
      { side: 'direct', source: 'quoted' },
    ],
  },
  {
    name: 'a card naming a record the applied side creates stays a card, and the applied op stays applied',
    ops: [kael({ quote: KAEL_QUOTE }), { op: 'brief.update', chapter: 5, pov: 'kael', body: 'Kael forges the key.' }],
    expected: [
      { side: 'direct', source: 'quoted' },
      { side: 'card', reason: 'always_card', rule: 'plan' },
    ],
  },
  {
    name: 'a quoted secret naming a character the applied side creates stays applied',
    ops: [kael({ quote: KAEL_QUOTE }), fact({ body: 'It eats memories.', subjects: ['kael'], quote: CROWN_QUOTE })],
    expected: [
      { side: 'direct', source: 'quoted' },
      { side: 'direct', source: 'quoted' },
    ],
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
    expected: [
      { side: 'direct', source: 'quoted' },
      { side: 'direct', source: 'quoted' },
      { side: 'card', reason: 'no_quote' },
    ],
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
    expect(renderTurnRules({ proseEdits: false, justDiscussing: true, mode: 'manual' })).toContain('becomes a suggestion card');
    expect(renderTurnRules({ proseEdits: false, mode: 'manual' })).not.toContain('Just discussing');
  });

  it('should describe Edit freely as immediate and undoable, and Ask first as suggestion cards', () => {
    const auto = renderTurnRules({ proseEdits: false, mode: 'auto' });
    const manual = renderTurnRules({ proseEdits: false, mode: 'manual' });

    expect(auto).toContain('added to the Story Bible immediately');
    expect(auto).toContain('undo');
    expect(auto).toContain('describe it as added');
    expect(auto).not.toContain('never as staged');
    expect(auto).toContain('always come to the author as cards to accept, never applied');
    for (const kept of [
      'removals and cleared fields',
      'replacing a filled story field',
      "plans, prose, actions, a secret's truth or gating",
      'planner-only pages',
      "a promise's status, payoff or progress or reusing a settled promise",
      "remove more than a quarter of a filled field's text",
    ]) {
      expect(auto).toContain(kept);
    }
    expect(auto).not.toContain('unless Edit prose is on');
    expect(auto).not.toContain('cut most of');
    expect(renderTurnRules({ proseEdits: true, mode: 'auto' })).toContain("plans, prose, actions, a secret's truth or gating");
    expect(manual).toContain('Ask first');
    expect(manual).toContain('is a suggestion card');
    expect(manual).not.toContain('immediately');
  });

  it('should let just discussing override the write policy in either mode', () => {
    for (const mode of ['auto', 'manual'] as const) {
      const rules = renderTurnRules({ proseEdits: false, justDiscussing: true, mode });

      expect(rules).toContain('becomes a suggestion card');
      expect(rules).not.toContain('Write policy');
    }
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
    expected: { side: 'direct', source: 'quoted' },
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
    expected: { side: 'direct', source: 'quoted' },
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
  {
    name: 'recording left-handedness applies',
    op: kaelOp({ notes: 'Left-handed.', quote: 'Kael is left-handed' }),
    message: PROBE_MESSAGE,
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'recording a hatred of boats applies',
    op: mira({ motivation: 'Hates boats.', quote: 'Mira hates boats' }),
    message: PROBE_MESSAGE,
    expected: { side: 'direct', source: 'quoted' },
  },
  {
    name: 'renaming a volume applies',
    op: { op: 'volume.upsert', volumeKey: 'v2', title: 'The Drowned Court', quote: VOLUME_QUOTE },
    message: PROBE_MESSAGE,
    existing: { 'volume:v2': { title: 'Untitled' } },
    expected: { side: 'direct', source: 'quoted' },
  },
];

const DOCKS = 'Mira grew up on the docks';
const cue = (name: string, message: string, side: OpSide = 'card'): Case => ({
  name,
  op: mira({ quote: DOCKS }),
  message,
  expected: side === 'card' ? { side, reason: 'tentative' } : { side, source: 'quoted' },
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
    expected: { side: 'direct', source: 'quoted' },
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
