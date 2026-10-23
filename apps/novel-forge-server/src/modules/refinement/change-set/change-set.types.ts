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

/**
 * Where a rewrite's passage sat in the draft when it was staged: offsets are UTF-16 code units into that revision's body, `paragraph` counted from
 * 1, and the text either side is what finds the passage again once an edit elsewhere has moved it.
 */
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

/**
 * Rewrites one passage of a draft in place. The model names the words by `passage`, never by offsets; staging finds them and stamps `anchor`,
 * so apply rewrites exactly the words the author saw on the card.
 */
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
 * Rationale and quote are metadata about the change, not part of it: they reach the author beside the op and are stripped before any
 * applier sees them, so `ContentOp` — the shape inverses are captured as — deliberately lacks them. `quote` is the author's own words
 * the op rests on; only a quote the server finds in the author's message lets the op apply without review. `ideaId` is stamped by the server
 * when the op is staged, so a turned-down suggestion is recognised when it comes back.
 */
export type ChangeOp = (ContentOp | ActionOp) & { rationale?: string; quote?: string; startedEmpty?: boolean; ideaId?: string };
export type OpType = ChangeOp['op'];
export type ActionType = ActionOp['op'];
