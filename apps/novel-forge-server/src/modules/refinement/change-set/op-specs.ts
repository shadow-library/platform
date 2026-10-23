import { type ActionOp, type ActionType, type ChangeOp, type OpType } from './change-set.types';

export type FieldKind = 'string' | 'string|null' | 'number' | 'number|null' | 'boolean' | 'string[]' | 'string[]|null' | 'object' | 'object[]' | 'object[]|null' | 'object|null';
interface OpSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
  /** Merge or lifecycle semantics the field list cannot show; rendered into the op vocabulary verbatim. */
  description?: string;
}

export const BRIEF_WRITE_MODES = ['standard', 'external'];
export const CONTENT_MODES = ['standard', 'unrestricted'];
export const BIBLE_SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];
export const ENTITY_TYPES = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];
export const MILESTONE_KINDS = ['rank', 'event', 'learned_from', 'custom'];
export const MILESTONE_KEY = /^\S+$/;
export const PROMISE_KINDS = ['thread', 'mystery'];
export const PROMISE_STATUSES = ['open', 'paid_off'];
export const PROMISE_KEY = /^\S+$/;
const DECLARED_OP_SPECS: Record<OpType, OpSpec> = {
  'premise.update': {
    required: {},
    optional: {
      premise: 'string',
      brief: 'string',
      themes: 'string[]',
      instructions: 'string',
      theme: 'string',
      readerPromise: 'string',
      protagonistKey: 'string',
      opposition: 'string',
      endingQuestion: 'string',
      ending: 'string',
    },
    description:
      'The story basics. theme is what the book is about underneath the plot, in a sentence; readerPromise is what the reader is waiting for and expects paid off; protagonistKey is the entity key of the character the reader follows; opposition is what pushes back on the leads, so chapters have something to write against — a person or faction, but just as well the situation itself, survival, nature, scarcity, a system or the lead’s own flaw, named specifically enough to escalate; endingQuestion is the question the ending answers and ending is how the book ends, both planner-only and never shown to the reader early.',
  },
  'bible_document.upsert': { required: { section: 'string', slug: 'string' }, optional: { frontmatter: 'object', body: 'string' } },
  'bible_document.remove': { required: { section: 'string', slug: 'string' }, optional: {} },
  'volume.upsert': {
    required: { volumeKey: 'string' },
    // `state` is deliberately not a field here: it moves only through action.advance_volume ("goal met — start next"), so this op cannot
    // set or change it — a stored op from before this rule carried one and must still parse, so it is tolerated on read and ignored on apply.
    optional: { ordinal: 'number', title: 'string', objective: 'string', body: 'string', state: 'string' },
    description:
      'objective is the goal the volume works towards; body holds the notes on it. A new volume always starts not_started; its state moves only through "goal met — start next".',
  },
  'volume.remove': { required: { volumeKey: 'string' }, optional: {} },
  'brief.update': {
    required: { chapter: 'number' },
    optional: {
      title: 'string',
      body: 'string',
      writeMode: 'string',
      volumeKey: 'string',
      contextRefs: 'string[]',
      pov: 'string|null',
      chapterPurpose: 'string',
      readerValue: 'string[]',
      repetitionRisks: 'string[]|null',
      densityRisk: 'string|null',
      endingContract: 'object',
      knowledgeContract: 'object|null',
      direction: 'string|null',
      contentMode: 'string|null',
      scenes: 'object[]|null',
      claimedMilestones: 'string[]|null',
      isEnding: 'boolean',
    },
    description: `direction is the agreed direction for the chapter; contentMode (${CONTENT_MODES.join(' | ')}, null = the project's) decides how it is written; scenes are [{"summary": <string>, "pov": <entity key or null>}]; claimedMilestones are the milestone keys the chapter reaches — each milestone is claimed by one plan at most; isEnding marks the planned final chapter, and only one plan may carry it. knowledgeContract.learns may name a fact only once the plan reaches its revealChapter and every term of its unlock holds for this plan (its own claimedMilestones and earlier plans' count as reached); an undated fact without an unlock cannot be revealed until it gets one. volumeKey names the volume whose goal the chapter serves; a new brief without one joins the volume of the nearest planned chapter before it. writeMode (one of: ${BRIEF_WRITE_MODES.join(' | ')}) governs batch selection: "external" halts the primary writer's batch at that chapter until it is finalized.`,
  },
  'brief.remove': { required: { chapter: 'number' }, optional: {} },
  'draft.update': { required: { chapter: 'number' }, optional: { title: 'string', body: 'string', summary: 'string' } },
  'draft.remove': { required: { chapter: 'number' }, optional: {} },
  'draft.rewrite_passage': {
    required: { chapter: 'number', passage: 'string', replacement: 'string' },
    optional: { label: 'string', contextIndex: 'number', anchor: 'object' },
    description:
      'rewrites one passage of a chapter draft and leaves every other word of the chapter as it is. passage is the exact text to replace, copied character for character from the draft or from a passage comment’s Quote lines without their indentation — never paraphrased, shortened or wrapped in quotation marks — and it must occur in the draft exactly once unless contextIndex names the passage comment it answers; replacement is the new text for exactly those words; label names the change in a few words ("the wrist injury"); contextIndex is the number of the passage comment it answers. Always a card the author applies passage by passage.',
  },
  'entity.upsert': {
    required: { entityKey: 'string', type: 'string' },
    optional: { name: 'string', status: 'string', motivation: 'string', notes: 'string', body: 'string' },
  },
  'entity.remove': { required: { entityKey: 'string' }, optional: {} },
  'fact.upsert': {
    required: { factKey: 'string' },
    optional: {
      body: 'string',
      subjects: 'string[]',
      constraintNote: 'string',
      writerNote: 'string',
      terms: 'string[]',
      revealChapter: 'number|null',
      unlock: 'object|null',
      allowedClues: 'string[]|null',
    },
  },
  'fact.remove': { required: { factKey: 'string' }, optional: {} },
  'milestone.upsert': {
    required: { milestoneKey: 'string' },
    optional: { label: 'string', subjectEntityKey: 'string|null', kind: 'string' },
    description: `a story event a chapter plan claims to reach and a fact's unlock may name; label is required for a new milestone; subjectEntityKey is the character it concerns (null clears it); kind is one of: ${MILESTONE_KINDS.join(' | ')}. Its state follows the plans and finalized chapters and cannot be set.`,
  },
  'milestone.remove': {
    required: { milestoneKey: 'string' },
    optional: {},
    description: "refused while a plan claims the milestone or a fact's unlock names it.",
  },
  'promise.create': {
    required: { kind: 'string', key: 'string', label: 'string' },
    optional: { openedChapter: 'number' },
    description: `kind is one of: ${PROMISE_KINDS.join(' | ')} — a promise is something the reader is waiting for. label is the thread's summary or the mystery's question.`,
  },
  'promise.update': {
    required: { kind: 'string', key: 'string' },
    optional: { label: 'string', lastAdvancedChapter: 'number', status: 'string' },
    description: `status (${PROMISE_STATUSES.join(' | ')}) closes a promise as paid off or reopens it; dropping one uses promise.drop instead. lastAdvancedChapter records the chapter that last moved it forward.`,
  },
  'promise.set_payoff': {
    required: { kind: 'string', key: 'string' },
    optional: { payoffMilestoneKey: 'string|null', payoffVolumeKey: 'string|null', payoffWindow: 'number|null', someday: 'boolean', dormant: 'boolean' },
    description:
      'sets what a promise pays off by — a milestone, a volume, or a chapter number — and whether it is dormant on purpose (silences the obligations recap and the dormant-thread report). Omit a payoff field to leave it; pass null to clear just that one; someday: true clears all three deliberately, instead of leaving every field out.',
  },
  'promise.drop': { required: { kind: 'string', key: 'string' }, optional: {}, description: 'gives up on a promise without deleting its record.' },
  'organise.rule': { required: { rule: 'string', optionId: 'string' }, optional: {}, description: 'a hard rule from the notes the author keeps as a Notebook direction.' },
  'action.generate_chapter': { required: { chapter: 'number' }, optional: {} },
  'action.audit_bible': { required: {}, optional: {} },
  'action.enhance_premise': { required: {}, optional: { overview: 'string' } },
  'action.judge_draft': { required: { chapter: 'number' }, optional: {} },
  'action.revise_draft': { required: { chapter: 'number', note: 'string' }, optional: {} },
  'action.approve_draft': { required: { chapter: 'number' }, optional: { revision: 'number', saveSeq: 'number', draftId: 'string' } },
  'action.apply_continuity': { required: { chapter: 'number' }, optional: {} },
  'action.validate': { required: { scope: 'string' }, optional: { chapter: 'number' } },
  'action.finalize': { required: {}, optional: { upTo: 'number' } },
  'action.organise_notes': { required: {}, optional: {} },
  'action.plan_chapter': { required: {}, optional: { chapter: 'number', intent: 'string', direction: 'string', empty: 'boolean' } },
  'action.advance_volume': { required: { volumeKey: 'string' }, optional: {} },
};

// Metadata about an op rather than a field of the artifact, so it rides on every op and apply drops it — derived, so a newly declared op cannot be the one that refuses it.
// `startedEmpty` marks a plan card staged as an empty plan for the author to fill in, and `ideaId` names a content op's idea: the server
// stamps both, so no model is shown them.
export const OP_METADATA_FIELDS = ['rationale', 'quote', 'startedEmpty', 'ideaId'] as const;
const SERVER_METADATA_FIELDS: readonly string[] = ['startedEmpty', 'ideaId'];
/** Fields the server stamps when a proposal is staged, whatever the model sent — so no model is ever shown them, and they are no part of an idea. */
const SERVER_STAMPED_FIELDS: Partial<Record<OpType, readonly string[]>> = {
  'action.approve_draft': ['revision', 'saveSeq', 'draftId'],
  'draft.rewrite_passage': ['anchor'],
};
// A rewrite's words are the chapter's, in `passage`, and it is always a card: a `quote` of the author's words beside it would only be mistaken for it.
const UNQUOTED_OPS: ReadonlySet<OpType> = new Set(['draft.rewrite_passage']);
export const OP_SPECS = Object.fromEntries(
  (Object.entries(DECLARED_OP_SPECS) as [OpType, OpSpec][]).map(([op, spec]): [OpType, OpSpec] => [
    op,
    { ...spec, optional: { ...spec.optional, rationale: 'string', quote: 'string', ideaId: 'string', ...(op === 'brief.update' ? { startedEmpty: 'boolean' } : {}) } },
  ]),
) as Record<OpType, OpSpec>;

/** The artifact fields an op may carry, metadata and server stamps excluded. */
export function declaredOpFields(op: OpType): string[] {
  const spec = DECLARED_OP_SPECS[op];
  const stamped = SERVER_STAMPED_FIELDS[op] ?? [];
  return [...Object.keys(spec.required), ...Object.keys(spec.optional)].filter(field => !stamped.includes(field));
}

const OP_TYPES = Object.keys(OP_SPECS) as OpType[];
export const ACTION_TYPES = OP_TYPES.filter(op => op.startsWith('action.')) as ActionType[];
export const CONTENT_OP_TYPES: readonly OpType[] = OP_TYPES.filter(op => !op.startsWith('action.'));
export const VALIDATION_SCOPES = ['novel', 'chapter'];

export function isActionOp(op: ChangeOp): op is ActionOp;
export function isActionOp(op: OpType): boolean;
export function isActionOp(op: ChangeOp | OpType): boolean {
  return (typeof op === 'string' ? op : op.op).startsWith('action.');
}

export function opFields(op: ChangeOp): Readonly<Record<string, unknown>> {
  return op as unknown as Record<string, unknown>;
}

export interface OpVocabularyOptions {
  /** Whether the vocabulary offers `quote`: only the chat turn has an author message for the server to find it in. */
  quotes?: boolean;
}

export function modelHiddenFields(op: OpType, options: OpVocabularyOptions): string[] {
  const quoted = options.quotes === true && !isActionOp(op) && !UNQUOTED_OPS.has(op);
  return [...SERVER_METADATA_FIELDS, ...(SERVER_STAMPED_FIELDS[op] ?? []), ...(quoted ? [] : ['quote'])];
}
