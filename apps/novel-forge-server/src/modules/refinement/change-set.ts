import { validateBriefScenes, validateUnlockCondition } from '@server/common';
import { type Bible, type BriefScene, type Generation, type Knowledge, type Project, type UnlockCondition } from '@server/database';

import { HOOK_TYPES, type HookTypeValue } from '../ai/schemas/enums';
import { requiredEntityTypesForSlug } from '../bible/bible-manifest';

interface EndingContract {
  hookType: HookTypeValue;
  emotionalBeat: string;
  openQuestion: string;
  handoffState: string;
  mustNotResolve?: string[];
}

export interface PremiseUpdateOp {
  op: 'premise.update';
  premise?: string;
  brief?: string;
  themes?: string[];
  instructions?: string;
}

export interface BibleDocumentUpsertOp {
  op: 'bible_document.upsert';
  section: Bible.Section;
  slug: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
}

export interface BibleDocumentRemoveOp {
  op: 'bible_document.remove';
  section: Bible.Section;
  slug: string;
}

/** No `state`: a volume's state moves only through `action.advance_volume` ("goal met — start next"), never through an upsert. A new volume is always created `not_started`. */
export interface VolumeUpsertOp {
  op: 'volume.upsert';
  volumeKey: string;
  ordinal?: number;
  title?: string;
  objective?: string;
  body?: string;
}

export interface VolumeRemoveOp {
  op: 'volume.remove';
  volumeKey: string;
}

interface KnowledgeReveal {
  entityKey: string;
  factKey: string;
}

interface KnowledgeContract {
  pov: string[];
  learns?: KnowledgeReveal[];
}

export interface BriefUpdateOp {
  op: 'brief.update';
  chapter: number;
  title?: string;
  body?: string;
  writeMode?: Generation.BriefWriteMode;
  /** An explicit `null` comes only from a captured inverse, so a revert takes a brief back out of a volume the proposal put it in; `OP_SPECS` refuses it from anyone else. */
  volumeKey?: string | null;
  contextRefs?: string[];
  /** `null` clears the chapter's point of view. */
  pov?: string | null;
  chapterPurpose?: string;
  readerValue?: string[];
  repetitionRisks?: string[] | null;
  densityRisk?: string | null;
  endingContract?: EndingContract;
  /** Explicit `null` drops the chapter's contract — the only way to un-reveal without deleting the brief. */
  knowledgeContract?: KnowledgeContract | null;
  direction?: string | null;
  /** `null` returns the chapter to the project's content mode. */
  contentMode?: Project.ContentMode | null;
  scenes?: BriefScene[] | null;
  claimedMilestones?: string[] | null;
  isEnding?: boolean;
}

export interface BriefRemoveOp {
  op: 'brief.remove';
  chapter: number;
}

export interface DraftUpdateOp {
  op: 'draft.update';
  chapter: number;
  title?: string;
  body?: string;
  summary?: string;
}

export interface DraftRemoveOp {
  op: 'draft.remove';
  chapter: number;
}

export interface EntityUpsertOp {
  op: 'entity.upsert';
  entityKey: string;
  type: 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';
  name?: string;
  status?: string;
  motivation?: string;
  notes?: string;
  body?: string;
}

export interface EntityRemoveOp {
  op: 'entity.remove';
  entityKey: string;
}

/**
 * Spoiler-grade canon. `body` is the truth itself and never reaches a drafter who has not ledgered
 * it; `constraintNote` is author-only, `writerNote` is the writer-safe instruction shown while the fact
 * is hidden (omitted keeps the current one, blank clears it), and `terms` are the tell-tale strings the leak scan hunts for. Reveals are deliberately absent —
 * a fact enters the ledger through a brief's knowledgeContract and draft approval, nowhere else.
 * `revealChapter` is the schedule, not the ledger: omitted keeps it, a number sets it (1 is open canon), explicit `null` undates the fact, which no plan may reveal until it has an unlock condition.
 */
export interface FactUpsertOp {
  op: 'fact.upsert';
  factKey: string;
  body?: string;
  subjects?: string[];
  constraintNote?: string;
  writerNote?: string;
  terms?: string[];
  revealChapter?: number | null;
  unlock?: UnlockCondition | null;
  allowedClues?: string[] | null;
}

export interface FactRemoveOp {
  op: 'fact.remove';
  factKey: string;
}

/** A milestone's state follows the plans that claim it and the chapters that reach it, so no op sets it. */
export interface MilestoneUpsertOp {
  op: 'milestone.upsert';
  milestoneKey: string;
  label?: string;
  subjectEntityKey?: string | null;
  kind?: Knowledge.MilestoneKind;
}

export interface MilestoneRemoveOp {
  op: 'milestone.remove';
  milestoneKey: string;
}

export type PromiseKind = 'thread' | 'mystery';

/** A new promise — a thread or a mystery the reader is waiting on. `label` is the thread's summary or the mystery's question. */
export interface PromiseCreateOp {
  op: 'promise.create';
  kind: PromiseKind;
  key: string;
  label: string;
  openedChapter?: number;
}

/**
 * Rewords a promise or records that continuity moved it forward. `status` closes it as paid off or reopens it — dropping one goes through
 * `promise.drop` instead, so a removal-shaped change is always a card.
 */
export interface PromiseUpdateOp {
  op: 'promise.update';
  kind: PromiseKind;
  key: string;
  label?: string;
  lastAdvancedChapter?: number;
  status?: 'open' | 'paid_off';
}

/**
 * What a promise pays off by — a milestone, a volume, a chapter, or `someday` (explicitly, not by omission) — and whether it is dormant on
 * purpose. Bundled together because both describe the same disposition: how, or whether, this promise is expected to resolve. Omitting a
 * payoff field leaves it as it stands; an explicit `null` clears just that one; `someday: true` clears all three at once.
 */
export interface PromiseSetPayoffOp {
  op: 'promise.set_payoff';
  kind: PromiseKind;
  key: string;
  payoffMilestoneKey?: string | null;
  payoffVolumeKey?: string | null;
  payoffWindow?: number | null;
  /** Clears payoffMilestoneKey, payoffVolumeKey and payoffWindow together — the deliberate way to say "someday", rather than leaving every field out. */
  someday?: boolean;
  dormant?: boolean;
}

/** Gives up on a promise without deleting its record — a removal card, like every other op that lets go of something. */
export interface PromiseDropOp {
  op: 'promise.drop';
  kind: PromiseKind;
  key: string;
}

/**
 * A hard rule an organise card offers from the notes. It writes no artifact: applying it is the author keeping the rule, which the organise
 * decision recorded in the same transaction turns into a Notebook direction, and undoing the card takes back.
 */
export interface OrganiseRuleOp {
  op: 'organise.rule';
  rule: string;
  optionId: string;
}

// Action ops drive the pipeline through existing service code. They carry no
// artifact refs, no baseline, and no inverse — they execute post-commit and their outcome lands in
// the proposal's opResults, never in domain tables directly.
interface GenerateChapterAction {
  op: 'action.generate_chapter';
  chapter: number;
}

interface AuditBibleAction {
  op: 'action.audit_bible';
}

interface EnhancePremiseAction {
  op: 'action.enhance_premise';
  overview?: string;
}

interface JudgeDraftAction {
  op: 'action.judge_draft';
  chapter: number;
}

interface ReviseDraftAction {
  op: 'action.revise_draft';
  chapter: number;
  note: string;
}

interface ApproveDraftAction {
  op: 'action.approve_draft';
  chapter: number;
  revision?: number;
  saveSeq?: number;
  draftId?: string;
}

interface ValidateAction {
  op: 'action.validate';
  scope: 'novel' | 'chapter';
  chapter?: number;
}

interface FinalizeAction {
  op: 'action.finalize';
  upTo?: number;
}

interface OrganiseNotesAction {
  op: 'action.organise_notes';
}

interface PlanChapterAction {
  op: 'action.plan_chapter';
  chapter?: number;
  intent?: string;
  direction?: string;
  empty?: boolean;
}

/** "Goal met — start next": only the currently active volume may be marked, and the next not-started volume in order becomes active. */
interface AdvanceVolumeAction {
  op: 'action.advance_volume';
  volumeKey: string;
}

export type ContentOp =
  | PremiseUpdateOp
  | BibleDocumentUpsertOp
  | BibleDocumentRemoveOp
  | VolumeUpsertOp
  | VolumeRemoveOp
  | BriefUpdateOp
  | BriefRemoveOp
  | DraftUpdateOp
  | DraftRemoveOp
  | EntityUpsertOp
  | EntityRemoveOp
  | FactUpsertOp
  | FactRemoveOp
  | MilestoneUpsertOp
  | MilestoneRemoveOp
  | PromiseCreateOp
  | PromiseUpdateOp
  | PromiseSetPayoffOp
  | PromiseDropOp
  | OrganiseRuleOp;

export type ActionOp =
  | GenerateChapterAction
  | AuditBibleAction
  | EnhancePremiseAction
  | JudgeDraftAction
  | ReviseDraftAction
  | ApproveDraftAction
  | ValidateAction
  | FinalizeAction
  | OrganiseNotesAction
  | PlanChapterAction
  | AdvanceVolumeAction;

/**
 * Rationale and quote are metadata about the change, not part of it: they reach the author beside the op and are stripped before any
 * applier sees them, so `ContentOp` — the shape inverses are captured as — deliberately lacks them. `quote` is the author's own words
 * the op rests on; only a quote the server finds in the author's message lets the op apply without review. `ideaId` is stamped by the server
 * when the op is staged, so a turned-down suggestion is recognised when it comes back.
 */
export type ChangeOp = (ContentOp | ActionOp) & { rationale?: string; quote?: string; startedEmpty?: boolean; ideaId?: string };
export type OpType = ChangeOp['op'];
export type ActionType = ActionOp['op'];

type FieldKind = 'string' | 'string|null' | 'number' | 'number|null' | 'boolean' | 'string[]' | 'string[]|null' | 'object' | 'object[]' | 'object[]|null' | 'object|null';
interface OpSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
  /** Merge or lifecycle semantics the field list cannot show; rendered into the op vocabulary verbatim. */
  description?: string;
}

const BRIEF_WRITE_MODES = ['standard', 'external'];
const CONTENT_MODES = ['standard', 'unrestricted'];
const BIBLE_SECTIONS = ['project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore'];
const ENTITY_TYPES = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];
const MILESTONE_KINDS = ['rank', 'event', 'learned_from', 'custom'];
const MILESTONE_KEY = /^\S+$/;
const PROMISE_KINDS = ['thread', 'mystery'];
const PROMISE_STATUSES = ['open', 'paid_off'];
const PROMISE_KEY = /^\S+$/;
const DECLARED_OP_SPECS: Record<OpType, OpSpec> = {
  'premise.update': { required: {}, optional: { premise: 'string', brief: 'string', themes: 'string[]', instructions: 'string' } },
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
const OP_SPECS = Object.fromEntries(
  (Object.entries(DECLARED_OP_SPECS) as [OpType, OpSpec][]).map(([op, spec]): [OpType, OpSpec] => [
    op,
    { ...spec, optional: { ...spec.optional, rationale: 'string', quote: 'string', ideaId: 'string', ...(op === 'brief.update' ? { startedEmpty: 'boolean' } : {}) } },
  ]),
) as Record<OpType, OpSpec>;

/** The artifact fields an op may carry, metadata excluded. */
export function declaredOpFields(op: OpType): string[] {
  const spec = DECLARED_OP_SPECS[op];
  return [...Object.keys(spec.required), ...Object.keys(spec.optional)];
}

const OP_TYPES = Object.keys(OP_SPECS) as OpType[];
export const ACTION_TYPES = OP_TYPES.filter(op => op.startsWith('action.')) as ActionType[];
export const CONTENT_OP_TYPES: readonly OpType[] = OP_TYPES.filter(op => !op.startsWith('action.'));
const VALIDATION_SCOPES = ['novel', 'chapter'];

// What each action does, rendered into the hub playbook so the model picks actions by meaning, not by
// guessing from the name.
const ACTION_PURPOSES: Record<ActionType, string> = {
  'action.generate_chapter':
    'draft one planned chapter from its plan (drafted, judged, and queued for review) — chapters are written in order, so it must be the next one without a draft; never auto-applied',
  'action.audit_bible':
    'queue a Story Bible audit: missing, thin or pointless pages and records, and contradictions between pages, records, facts and finalized chapters — its report holds the findings and one card of proposed changes',
  'action.enhance_premise': 'evaluate and strengthen the premise as a web novel — stages a premise proposal',
  'action.judge_draft': 'run the continuity judge on one chapter draft',
  'action.revise_draft': 'revise one chapter draft using `note` as the revision feedback',
  'action.approve_draft': 'approve one reviewed chapter draft',
  'action.validate': 'run continuity validation over the novel or one chapter',
  'action.finalize': 'finalize drafted chapters into locked canon — irreversible, never auto-applied',
  'action.organise_notes': "organise the author's stored notes into Story Bible pages, records, a timeline and open questions — runs as a job and stages the result as a card",
  'action.plan_chapter':
    "plan the next chapter — the lowest-numbered one without a draft; `chapter` must be that chapter when given. Before planning, recap in your reply the two or three obligations that matter now (the previous chapter's hook, the longest-quiet promise, what the volume goal needs); when the author has not said what happens, offer two or three directions, each saying which obligation it moves and what it costs, and let the author choose. Then plan from `direction` (the one the author chose, as offered), `intent` (what the author says happens, in their words), or `empty: true` (an empty plan the author fills in). Runs as a job and stages the plan as a card; the plan never sets the chapter's content mode",
  'action.advance_volume':
    'the author\'s "goal met — start next": `volumeKey` must name the currently active volume, which becomes goal met; the next not-started volume in order becomes active, or none does if there isn\'t one yet — never auto-applied',
};

export function isActionOp(op: ChangeOp): op is ActionOp;
export function isActionOp(op: OpType): boolean;
export function isActionOp(op: ChangeOp | OpType): boolean {
  return (typeof op === 'string' ? op : op.op).startsWith('action.');
}

function isKind(value: unknown, kind: FieldKind): boolean {
  if (value === null && kind.endsWith('|null')) return true;
  if (kind === 'string' || kind === 'string|null') return typeof value === 'string';
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'number') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'number|null') return typeof value === 'number' && Number.isInteger(value);
  if (kind === 'string[]' || kind === 'string[]|null') return Array.isArray(value) && value.every(v => typeof v === 'string');
  if (kind === 'object[]' || kind === 'object[]|null') return Array.isArray(value) && value.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEndingContract(value: unknown, path: string, errors: string[]): void {
  if (!isKind(value, 'object')) return void errors.push(`${path}: endingContract must be an object`);
  const contract = value as Record<string, unknown>;
  if (typeof contract['hookType'] !== 'string' || !(HOOK_TYPES as readonly string[]).includes(contract['hookType']))
    errors.push(`${path}: endingContract.hookType must be one of ${HOOK_TYPES.join(', ')}`);
  for (const key of ['emotionalBeat', 'openQuestion', 'handoffState']) {
    if (typeof contract[key] !== 'string' || contract[key] === '') errors.push(`${path}: endingContract.${key} must be a non-empty string`);
  }
  if (contract['mustNotResolve'] !== undefined && !isKind(contract['mustNotResolve'], 'string[]')) errors.push(`${path}: endingContract.mustNotResolve must be a string array`);
}

function validateKnowledgeContract(value: unknown, path: string, errors: string[]): void {
  if (!isKind(value, 'object')) return void errors.push(`${path}: knowledgeContract must be an object`);
  const contract = value as Record<string, unknown>;
  for (const key of Object.keys(contract)) {
    if (key !== 'pov' && key !== 'learns') errors.push(`${path}: unexpected field 'knowledgeContract.${key}'`);
  }

  const pov = contract['pov'];
  if (!isKind(pov, 'string[]') || (pov as string[]).length === 0 || (pov as string[]).some(key => key === '')) {
    errors.push(`${path}: knowledgeContract.pov must be a non-empty array of entity keys`);
  }

  const learns = contract['learns'];
  if (learns === undefined) return;
  if (!Array.isArray(learns)) return void errors.push(`${path}: knowledgeContract.learns must be an array`);
  learns.forEach((reveal, index) => {
    const at = `${path}: knowledgeContract.learns[${index}]`;
    if (!isKind(reveal, 'object')) return void errors.push(`${at} must be an object`);
    const record = reveal as Record<string, unknown>;
    for (const key of ['entityKey', 'factKey']) {
      if (typeof record[key] !== 'string' || record[key] === '') errors.push(`${at}.${key} must be a non-empty string`);
    }
    for (const key of Object.keys(record)) {
      if (key !== 'entityKey' && key !== 'factKey') errors.push(`${at}: unexpected field '${key}'`);
    }
  });
}

/**
 * Local models routinely emit the whole doc ref in the section and/or slug field of bible_document
 * ops (`{"section": "project/premise", "slug": "project/premise"}`, sometimes `doc:`-prefixed).
 * The intent is unambiguous, so repair it deterministically instead of burning a model retry:
 * strip a `doc:` prefix, split an embedded `section/slug`, and de-duplicate a section-prefixed slug.
 * Anything that doesn't match a known section is left untouched for validation to reject.
 */
function normalizeBibleDocumentOp(record: Record<string, unknown>): void {
  let section = record['section'];
  let slug = record['slug'];
  if (typeof section === 'string' && section.startsWith('doc:')) section = section.slice(4);
  if (typeof slug === 'string' && slug.startsWith('doc:')) slug = slug.slice(4);
  if (typeof section === 'string' && section.includes('/')) {
    const [head, ...rest] = section.split('/');
    if (BIBLE_SECTIONS.includes(head as string)) {
      section = head;
      if (typeof slug !== 'string' || slug === record['section'] || slug === '') slug = rest.join('/');
    }
  }
  if (typeof section === 'string' && typeof slug === 'string' && slug.startsWith(`${section}/`)) slug = slug.slice(section.length + 1);
  record['section'] = section;
  record['slug'] = slug;
}

/**
 * The Story Bible screen lists `entities`, never document bodies, so canon written only as prose into an
 * entity-bearing section is invisible to the author and to every downstream step that reads records.
 * `requiredEntityTypesForSlug` decides what a given address owes, which is what catches an author-named
 * document like `power/supers-and-rifts`. Frontmatter-only edits are exempt, and the rule stays silent for a
 * scope whose vocabulary cannot express `entity.upsert` at all — that scope could never satisfy it.
 */
function validateEntityMaterialization(ops: readonly unknown[], allowedOps?: readonly OpType[]): string[] {
  if (allowedOps && !allowedOps.includes('entity.upsert')) return [];

  const records = ops.filter((op): op is Record<string, unknown> => isKind(op, 'object'));
  const staged = new Set(records.filter(op => op['op'] === 'entity.upsert').map(op => String(op['type'])));
  const errors: string[] = [];

  ops.forEach((item, index) => {
    if (!isKind(item, 'object')) return;
    const op = item as Record<string, unknown>;
    if (op['op'] !== 'bible_document.upsert') return;
    if (typeof op['body'] !== 'string' || op['body'].trim() === '') return;

    const section = String(op['section']);
    const slug = String(op['slug']);
    const required = requiredEntityTypesForSlug(section, slug);
    if (required.length === 0 || required.some(type => staged.has(type))) return;

    errors.push(
      `changeSet[${index}]: bible_document.upsert into '${section}/${slug}' establishes canon the Story Bible reads as records, so it must be accompanied by entity.upsert op(s) of type ${required.join(' or ')} — a document body alone leaves this canon invisible`,
    );
  });

  return errors;
}

export interface ChangeSetValidationOptions {
  /** `false` only for a change-set that rearranges prose the bible already holds, and so cannot be the one that leaves canon unrecorded. */
  entityMaterialization?: boolean;
}

/**
 * Validates an untrusted change-set structurally, optionally against a scope's allowed-op vocabulary.
 * Returns human-readable errors; an empty array means `value` is a well-formed `ChangeOp[]`.
 * Obviously-malformed-but-unambiguous bible_document refs are normalized in place first (see above),
 * so every staging and apply path repairs them consistently.
 */
export function validateChangeSet(value: unknown, allowedOps?: readonly OpType[], options?: ChangeSetValidationOptions): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) return ['changeSet must be an array of operations'];
  if (value.length === 0) return ['changeSet must contain at least one operation'];

  for (const item of value) {
    if (isKind(item, 'object') && typeof (item as Record<string, unknown>)['op'] === 'string' && ((item as Record<string, unknown>)['op'] as string).startsWith('bible_document'))
      normalizeBibleDocumentOp(item as Record<string, unknown>);
  }

  value.forEach((item, index) => {
    const path = `changeSet[${index}]`;
    if (!isKind(item, 'object')) return void errors.push(`${path}: must be an object`);
    const record = item as Record<string, unknown>;
    const op = record['op'];
    if (typeof op !== 'string' || !(op in OP_SPECS)) return void errors.push(`${path}: unknown op '${String(op)}'`);
    if (allowedOps && !allowedOps.includes(op as OpType)) return void errors.push(`${path}: op '${op}' is not allowed for this scope`);

    const spec = OP_SPECS[op as OpType];
    for (const [key, kind] of Object.entries(spec.required)) {
      if (!isKind(record[key], kind)) errors.push(`${path}: missing or invalid required field '${key}' (${kind})`);
    }
    for (const [key, kind] of Object.entries(spec.optional)) {
      if (record[key] !== undefined && !isKind(record[key], kind)) errors.push(`${path}: invalid field '${key}' (expected ${kind})`);
    }
    for (const key of Object.keys(record)) {
      if (key !== 'op' && !(key in spec.required) && !(key in spec.optional)) errors.push(`${path}: unexpected field '${key}'`);
    }

    if (op.startsWith('bible_document') && !BIBLE_SECTIONS.includes(record['section'] as string)) errors.push(`${path}: section must be one of ${BIBLE_SECTIONS.join(', ')}`);
    if (op === 'entity.upsert' && !ENTITY_TYPES.includes(record['type'] as string)) errors.push(`${path}: type must be one of ${ENTITY_TYPES.join(', ')}`);
    if (op === 'brief.update' && record['writeMode'] !== undefined && !BRIEF_WRITE_MODES.includes(record['writeMode'] as string))
      errors.push(`${path}: writeMode must be one of ${BRIEF_WRITE_MODES.join(', ')}`);
    if (op === 'brief.update' && record['endingContract'] !== undefined) validateEndingContract(record['endingContract'], path, errors);
    if (op === 'brief.update' && record['knowledgeContract'] != null) validateKnowledgeContract(record['knowledgeContract'], path, errors);
    if (op === 'brief.update' && typeof record['contentMode'] === 'string' && !CONTENT_MODES.includes(record['contentMode']))
      errors.push(`${path}: contentMode must be one of ${CONTENT_MODES.join(', ')}`);
    if (op === 'brief.update' && Array.isArray(record['scenes'])) errors.push(...validateBriefScenes(record['scenes']).map(error => `${path}: ${error}`));
    if (op === 'brief.update' && Array.isArray(record['claimedMilestones']) && (record['claimedMilestones'] as unknown[]).some(key => typeof key !== 'string' || key.trim() === ''))
      errors.push(`${path}: claimedMilestones must hold non-empty milestone keys`);
    if (op === 'milestone.upsert' && record['kind'] !== undefined && !MILESTONE_KINDS.includes(record['kind'] as string))
      errors.push(`${path}: kind must be one of ${MILESTONE_KINDS.join(', ')}`);
    if (op === 'milestone.upsert' && typeof record['label'] === 'string' && record['label'].trim() === '') errors.push(`${path}: label must not be blank`);
    if (op.startsWith('milestone.') && typeof record['milestoneKey'] === 'string' && !MILESTONE_KEY.test(record['milestoneKey']))
      errors.push(`${path}: milestoneKey must be a non-empty key without spaces`);
    if (op === 'fact.upsert' && typeof record['revealChapter'] === 'number' && record['revealChapter'] < 1) errors.push(`${path}: revealChapter must be >= 1`);
    if (op === 'fact.upsert' && Array.isArray(record['allowedClues']) && (record['allowedClues'] as unknown[]).some(clue => typeof clue !== 'string' || clue.trim() === ''))
      errors.push(`${path}: allowedClues must hold non-empty strings`);
    if (op === 'fact.upsert' && isKind(record['unlock'], 'object')) errors.push(...validateUnlockCondition(record['unlock']).map(error => `${path}: ${error}`));
    if (op === 'draft.update' && record['title'] === undefined && record['body'] === undefined && record['summary'] === undefined) {
      errors.push(`${path}: draft.update must set at least one of title, body, summary`);
    }
    if (op === 'action.validate' && !VALIDATION_SCOPES.includes(record['scope'] as string)) errors.push(`${path}: scope must be one of ${VALIDATION_SCOPES.join(', ')}`);
    if (op === 'action.generate_chapter' && typeof record['chapter'] === 'number' && record['chapter'] < 1) errors.push(`${path}: chapter must be >= 1`);
    if (op.startsWith('promise.') && !PROMISE_KINDS.includes(record['kind'] as string)) errors.push(`${path}: kind must be one of ${PROMISE_KINDS.join(', ')}`);
    if (op.startsWith('promise.') && typeof record['key'] === 'string' && !PROMISE_KEY.test(record['key'])) errors.push(`${path}: key must be a non-empty key without spaces`);
    if (op === 'promise.create' && typeof record['label'] === 'string' && record['label'].trim() === '') errors.push(`${path}: label must not be blank`);
    if (op === 'promise.update' && record['status'] !== undefined && !PROMISE_STATUSES.includes(record['status'] as string))
      errors.push(`${path}: status must be one of ${PROMISE_STATUSES.join(', ')}`);
    if (op === 'promise.set_payoff' && record['someday'] === true && ['payoffMilestoneKey', 'payoffVolumeKey', 'payoffWindow'].some(field => record[field] !== undefined))
      errors.push(`${path}: someday cannot be combined with payoffMilestoneKey, payoffVolumeKey or payoffWindow`);
  });

  if (errors.length === 0 && options?.entityMaterialization !== false) errors.push(...validateEntityMaterialization(value, allowedOps));

  return errors;
}

/** What a plugin may propose: what the novel contains, never its structure — a brief's volume, mode, milestones and ending are the book's shape, which only the author rearranges. */
export const PLUGIN_ALLOWED_OPS: readonly OpType[] = [
  'entity.upsert',
  'entity.remove',
  'fact.upsert',
  'fact.remove',
  'bible_document.upsert',
  'bible_document.remove',
  'brief.update',
];

const BRIEF_STRUCTURE_FIELDS = ['volumeKey', 'contentMode', 'claimedMilestones', 'isEnding'] as const;

/** The plugin allowlist enforced against the real `OP_SPECS`, because a plugin's emitted ops are untrusted input at runtime. */
export function validatePluginChangeSet(value: unknown): string[] {
  const errors = validateChangeSet(value, PLUGIN_ALLOWED_OPS);
  if (!Array.isArray(value)) return errors;

  value.forEach((item, index) => {
    if (!isKind(item, 'object')) return;
    const record = item as Record<string, unknown>;
    const refused = record['op'] === 'brief.update' ? BRIEF_STRUCTURE_FIELDS : [];
    for (const field of refused) {
      if (record[field] !== undefined) errors.push(`changeSet[${index}]: field '${field}' is not allowed for this scope`);
    }
  });

  return errors;
}

const RATIONALE_NOTE =
  'rationale, on any op, is one short sentence saying why that change is being made. It is shown to the author beside the op when they review the proposal and is never written into the story itself.';

const QUOTE_NOTE =
  "quote, on any op, is the exact words from the author's message in this turn that the op records — copied character for character, never paraphrased, shortened with an ellipsis, or taken from an earlier message or your own reply. The server decides whether an op with a quote the author really wrote applies: it must only record what they said, stated rather than asked or hedged. Every other op becomes a suggestion card the author accepts or declines. Give a quote only when the op states what the author said, and leave it out of your own ideas.";

export interface OpVocabularyOptions {
  /** Whether the vocabulary offers `quote`: only the chat turn has an author message for the server to find it in. */
  quotes?: boolean;
}

/**
 * Renders the exact JSON shape of each allowed op for prompt use — weak local models return
 * malformed change-sets when the vocabulary is named but never shown.
 */
export function renderOpVocabulary(ops: readonly OpType[], options: OpVocabularyOptions = {}): string {
  const lines = ops.map(op => {
    const spec = OP_SPECS[op];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional)
      .filter(([key]) => (options.quotes || key !== 'quote') && !SERVER_METADATA_FIELDS.includes(key))
      .map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${op}"${[...required, ...optional].map(f => `, ${f}`).join('')}}${spec.description ? ` — ${spec.description}` : ''}`;
  });
  const contractShape = ops.includes('brief.update')
    ? `\nendingContract, when present, must be exactly: {"hookType": <one of: ${HOOK_TYPES.join(' | ')}>, "emotionalBeat": <non-empty string>, "openQuestion": <non-empty string>, "handoffState": <non-empty string>, "mustNotResolve": <string[], optional>} — hookType is an enum, never free text.`
    : '';
  const knowledgeShape = ops.includes('brief.update')
    ? `\nknowledgeContract, when present, must be exactly: {"pov": <non-empty array of entity keys>, "learns": <optional array of {"entityKey": <string>, "factKey": <string>}>} — pov bounds what the chapter may state; learns names the facts discovered on-page. A chapter that reveals nothing previously hidden omits the contract entirely; pass null to drop one the brief already carries.`
    : '';
  const factRules = ops.includes('fact.upsert')
    ? '\nCanon facts are the spoiler ledger: a truth the reader must not learn yet goes in fact.upsert body and NEVER in bible prose, an entity sheet, or a brief — those are visible to the drafter. constraintNote is an author-only note the drafter never sees; writerNote is the writer-safe instruction the drafter gets while the fact is hidden — it must never state or hint at the truth, and without one the fact is withheld from the drafter entirely; terms are the give-away names and phrases the leak scan blocks. In a mystery the reveal schedule IS the plot, so place each reveal deliberately: set revealChapter as the intended beat and stage the matching brief.update knowledgeContract.learns that pays it off. Omit revealChapter to leave the schedule alone; pass null to undate the fact — an undated fact without an unlock stays hidden and no plan may reveal it. unlock, when present, is {"all": [<one of {"milestone": <key>} | {"volume": <key>} | {"chapter": <number>} | {"ending": true}>, ...]} — the fact may be revealed only once every term holds; allowedClues are observable effects the writer may show while the explanation stays hidden. Omit either to keep it; pass null to clear it.'
    : '';
  const quoteNote = options.quotes ? `\n${QUOTE_NOTE}` : '';
  return `changeSet, when present, must be an ARRAY of operation objects. Allowed operations and their fields:\n${lines.join('\n')}\n${RATIONALE_NOTE}${quoteNote}${contractShape}${knowledgeShape}${factRules}`;
}

/** Fields the server stamps when a proposal is staged, whatever the model sent — so no model is ever shown them. */
const SERVER_STAMPED_FIELDS: Partial<Record<ActionType, readonly string[]>> = { 'action.approve_draft': ['revision', 'saveSeq', 'draftId'] };

/** Action shapes + what each one does — the pipeline half of the hub playbook. */
export function renderActionVocabulary(actions: readonly ActionType[]): string {
  const lines = actions.map(action => {
    const spec = OP_SPECS[action];
    const stamped = SERVER_STAMPED_FIELDS[action] ?? [];
    const required = Object.entries(spec.required).map(([key, kind]) => `"${key}": <${kind}, required>`);
    const optional = Object.entries(spec.optional)
      .filter(([key]) => !stamped.includes(key) && key !== 'quote' && !SERVER_METADATA_FIELDS.includes(key))
      .map(([key, kind]) => `"${key}": <${kind}, optional>`);
    return `- {"op": "${action}"${[...required, ...optional].map(f => `, ${f}`).join('')}} — ${ACTION_PURPOSES[action]}`;
  });
  return `Action operations may appear in the same changeSet array; they run the pipeline instead of editing content. Use one only when the author asks for that work to happen:\n${lines.join('\n')}`;
}

/** The artifact refs a change-set touches — the keys used for baselines, conflict checks, and supersession. Actions touch none. */
export function changeSetRefs(ops: ChangeOp[]): string[] {
  const refs = ops.flatMap(op => {
    if (isActionOp(op)) return [];
    if (op.op === 'premise.update') return ['premise'];
    if (op.op === 'bible_document.upsert' || op.op === 'bible_document.remove') return [`doc:${op.section}/${op.slug}`];
    if (op.op === 'volume.upsert' || op.op === 'volume.remove') return [`volume:${op.volumeKey}`];
    if (op.op === 'entity.upsert' || op.op === 'entity.remove') return [`entity:${op.entityKey}`];
    if (op.op === 'fact.upsert' || op.op === 'fact.remove') return [`fact:${op.factKey}`];
    if (op.op === 'milestone.upsert' || op.op === 'milestone.remove') return [`milestone:${op.milestoneKey}`];
    if (op.op === 'promise.create' || op.op === 'promise.update' || op.op === 'promise.set_payoff' || op.op === 'promise.drop') return [`promise:${op.kind}:${op.key}`];
    if (op.op === 'organise.rule') return [];
    if (op.op === 'draft.update' || op.op === 'draft.remove') return [`draft:${op.chapter}`];
    return [`chapter:${op.chapter}`];
  });
  return [...new Set(refs)];
}
