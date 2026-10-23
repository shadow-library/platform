import { type Bible, type BriefScene, type Generation, type Knowledge, type Project, type UnlockCondition } from '@server/database';

import { type HookTypeValue } from '../../ai/schemas/enums';

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
  theme?: string;
  readerPromise?: string;
  protagonistKey?: string;
  opposition?: string;
  endingQuestion?: string;
  ending?: string;
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

/** Where a staged rewrite's passage sat: offsets are UTF-16 code units into that revision's body, `paragraph` from 1; the surrounding text re-finds it after an edit elsewhere. */
export interface PassageRewriteAnchor {
  draftId: string;
  revision: number;
  saveSeq: number;
  start: number;
  end: number;
  passageHash: string;
  paragraph: number;
  contextBefore: string;
  contextAfter: string;
}

/** Rewrites one passage in place; the model names words by `passage`, staging stamps `anchor`, so apply rewrites exactly what the card showed. */
export interface DraftRewritePassageOp {
  op: 'draft.rewrite_passage';
  chapter: number;
  passage: string;
  replacement: string;
  label?: string;
  contextIndex?: number;
  anchor?: PassageRewriteAnchor;
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
 * `body` never reaches a drafter who has not ledgered it; `constraintNote` is author-only; `writerNote` is the writer-safe instruction while hidden (blank clears).
 * `terms` are what the leak scan hunts for. Reveals are absent: a fact enters the ledger only through a brief's knowledgeContract and draft approval.
 * `revealChapter`: omitted keeps, a number sets (1 is open canon), `null` undates the fact, which no plan may reveal until it has an unlock condition.
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

/** Rewords a promise or records continuity moving it; `status` closes or reopens it, while dropping goes through `promise.drop` so a removal is always a card. */
export interface PromiseUpdateOp {
  op: 'promise.update';
  kind: PromiseKind;
  key: string;
  label?: string;
  lastAdvancedChapter?: number;
  status?: 'open' | 'paid_off';
}

/** Payoff target (milestone, volume, chapter or explicit `someday`) and dormancy; omitted keeps a field, `null` clears it, `someday: true` clears all three. */
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

/** A hard rule an organise card offers: writes no artifact; applying is the author keeping it as a Notebook direction, undoing the card takes it back. */
export interface OrganiseRuleOp {
  op: 'organise.rule';
  rule: string;
  optionId: string;
}

// Action ops carry no artifact refs, baseline or inverse: they execute post-commit and their outcome lands in the proposal's opResults.
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

interface ApplyContinuityAction {
  op: 'action.apply_continuity';
  chapter: number;
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
  | DraftRewritePassageOp
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
  | ApplyContinuityAction
  | ValidateAction
  | FinalizeAction
  | OrganiseNotesAction
  | PlanChapterAction
  | AdvanceVolumeAction;

/**
 * Rationale and quote are metadata stripped before any applier, so `ContentOp` (the shape inverses are captured as) lacks them.
 * Only a `quote` the server finds in the author's message lets an op apply without review; `ideaId` is server-stamped so a turned-down suggestion is recognised on return.
 */
export type ChangeOp = (ContentOp | ActionOp) & { rationale?: string; quote?: string; startedEmpty?: boolean; ideaId?: string };
export type OpType = ChangeOp['op'];
export type ActionType = ActionOp['op'];
