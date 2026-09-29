import { and, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, type ErrorCode, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode, OpDependencyError, RevealRuleError } from '@server/classes';
import {
  assertMilestoneSubject,
  assertStartsNextChapter,
  auditCardSelection,
  autoActivateVolume,
  briefContentHash,
  changedCluesNamingTerms,
  computeBibleDocHash,
  enforcePlanWrite,
  findMilestoneReferences,
  lockProjectPlan,
  markDescendantDraftsStale,
  nearestVolumeKey,
  nextWritableChapter,
  normalizeLineEndings,
  normalizeStringList,
  planFrontier,
  pruneDraftHistory,
  refusedDraftWriteError,
  resetApprovalForPlanChange,
  revokeProvisionalReveals,
  volumeContentHash,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema, type Story } from '@server/database';

import { defaultChapterMode } from '../ai/chapter-route';
import { runWithCostTier } from '../ai/cost-tier-scope';
import { isCostTier } from '../ai/defaults';
import { writingInstructionAdditions } from '../ai/prompts/writing-instructions';
import { hasOrganiseUndo, recordOrganiseDecision, revertOrganiseDecision, wholeOrganiseSelection } from '../notes/organise-record';
import { type ActionExecutionResult, type ActionExecutor, ActionExecutorRegistry } from './action-registry';
import { type ArtifactState, loadArtifactStates, MISSING_ARTIFACT } from './artifact-state';
import { type BriefRestoreFields, mergeBriefUpdate } from './brief-merge';
import { CHAT_TURN_GRAPH } from './chat-selection';
import {
  type ActionOp,
  type BibleDocumentRemoveOp,
  type BibleDocumentUpsertOp,
  type BriefRemoveOp,
  type BriefUpdateOp,
  type ChangeOp,
  changeSetRefs,
  type ContentOp,
  type DraftRemoveOp,
  type DraftUpdateOp,
  type EntityRemoveOp,
  type EntityUpsertOp,
  type FactRemoveOp,
  type FactUpsertOp,
  isActionOp,
  type MilestoneRemoveOp,
  type MilestoneUpsertOp,
  OP_METADATA_FIELDS,
  type PremiseUpdateOp,
  type PromiseCreateOp,
  type PromiseDropOp,
  type PromiseKind,
  type PromiseSetPayoffOp,
  type PromiseUpdateOp,
  type VolumeRemoveOp,
  type VolumeUpsertOp,
} from './change-set';
import { AppliedOpGraph, type OpUndoRecord } from './op-undo';
import { ALWAYS_CARD, type OpSource } from './write-policy';

export interface AppliedArtifact {
  artifactRef: string;
  newRevision: number | null;
  newSaveSeq?: number;
  newDraftId?: bigint;
}

export interface OpResult {
  index: number;
  /** `reverted`: a change a chat turn applied, undone on its own while the rest of its turn stays applied. */
  status: 'applied' | 'declined' | 'pending' | 'failed' | 'reverted';
  /** Set on every op a chat turn applied: whether the author's words backed it or it was the model's idea. */
  source?: OpSource;
  error?: string;
  /** Why the engine declined an op the author did not reject; only proposals applied before the quote rule carry one. */
  note?: string;
  result?: Record<string, unknown>;
}

export interface ApplyOptions {
  opIndexes?: number[];
  /** Set when a turn or the organise job applies what the write policy let through; such an apply never carries an always-card op. */
  autoApplied?: boolean;
  /** The write policy's source for each op of an automatic apply, indexed like the change-set and kept on its result. */
  opSources?: readonly OpSource[];
  /** Applies inside the caller's transaction, so the change commits or rolls back with the caller's own writes. Content ops only: actions run after a commit. */
  tx?: PrimaryTransaction;
}

export interface ApplyResult {
  proposal: Refinement.Proposal;
  applied: AppliedArtifact[];
  staleMarked: string[];
  opResults: OpResult[];
}

export interface RevertResult {
  proposal: Refinement.Proposal;
  reverted: AppliedArtifact[];
  staleMarked: string[];
}

export interface OpToggleResult<T = never> {
  proposal: Refinement.Proposal;
  artifacts: AppliedArtifact[];
  staleMarked: string[];
  /** False when the change already stood as asked: undo and redo are idempotent. */
  changed: boolean;
  op: ContentOp;
  source?: OpSource;
  /** What the caller's hook returned; present only when the change moved. */
  followUp?: T;
}

/** Runs inside the undo or redo transaction once the change moved, so the caller's own writes commit or roll back with it. */
export type OpToggleHook<T> = (tx: PrimaryTransaction, change: { op: ContentOp; source?: OpSource }) => Promise<T>;

export interface RollbackResult {
  reverted: { proposalId: bigint; artifacts: AppliedArtifact[] }[];
  skipped: bigint[];
  stoppedAt?: bigint;
  conflict?: Record<string, unknown>;
}

interface BaselineMismatch {
  artifactRef: string;
  expected: ArtifactState | undefined;
  actual: ArtifactState;
}

// A captured inverse writes back exactly what the row held: a field that was empty comes back `null`, so undoing an op that filled it
// empties it again instead of merging as "keep". `OP_SPECS` refuses `null` for these fields, so only an inverse ever carries one.
type Restorable<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };

type PremiseRestoreOp = Restorable<PremiseUpdateOp, 'premise' | 'brief' | 'themes' | 'instructions'>;
type BibleDocumentRestoreOp = Restorable<BibleDocumentUpsertOp, 'frontmatter' | 'body'>;
type VolumeRestoreOp = Restorable<VolumeUpsertOp, 'title' | 'objective' | 'body'>;
type EntityRestoreOp = Restorable<EntityUpsertOp, 'status' | 'motivation' | 'notes' | 'body'>;
type FactRestoreOp = Restorable<FactUpsertOp, 'subjects' | 'constraintNote' | 'terms'>;

// Captured on the inverse and restored on revert, but deliberately absent from `OP_SPECS`: whether a human wrote the brief
// is the engine's to record, never a field a model or author change-set can set.
type BriefRestoreOp = BriefRestoreFields & { handEdited?: boolean };

// A removed milestone comes back with the chapter that reached it; its planned state is re-derived from the plans.
type MilestoneRestoreOp = MilestoneUpsertOp & { reachedChapter?: number | null; boundRevision?: number | null };

// The union of both promise tables' `status` columns — 'closed' is a thread's paid-off value, 'resolved' a mystery's.
type PromiseDbStatus = 'open' | 'closed' | 'resolved' | 'dropped';

// promise.update's public vocabulary can neither null a progress chapter, a paid-off chapter, or a label, nor name "dropped" (dropping goes
// through promise.drop) — only a captured inverse needs any of those, so each rides in on its own field rather than widening the ones a
// model or author can set.
type PromiseUpdateRestoreOp = PromiseUpdateOp & {
  restoreLabel?: string | null;
  restoreLastAdvancedChapter?: number | null;
  restoreStatus?: PromiseDbStatus;
  restoreChapterColumn?: number | null;
};
// A drop never deletes the row — but the inverse of a promise.create must, since the promise never existed before it.
type PromiseDropRestoreOp = PromiseDropOp & { hardDelete?: true };

interface PromiseRow {
  label: string | null;
  status: PromiseDbStatus;
  /** `closedChapter` for a thread, `resolvedChapter` for a mystery — the chapter it paid off in, if it has. */
  chapterColumn: number | null;
  lastAdvancedChapter: number | null;
  payoffMilestoneKey: string | null;
  payoffVolumeKey: string | null;
  payoffWindow: number | null;
  intentionallyOpen: boolean;
}

// The same for a removed draft's containment: reverting a removal must bring an isolated draft back isolated, whatever the op's author wrote.
type DraftRestoreOp = Restorable<DraftUpdateOp, 'title' | 'summary'> & { isolated?: boolean; generator?: Project.ContentGenerator };

/** An op's value for a field, or the row's when the op leaves it out; only a restore op's `null` clears it. */
function keptOr<T>(value: T | null | undefined, existing: T | null | undefined): T | null {
  return value === undefined ? (existing ?? null) : value;
}

interface ApplyContext {
  tx: PrimaryDatabase;
  projectId: bigint;
  applied: AppliedArtifact[];
  staleMarked: string[];
}

type TxResult =
  | { outcome: 'applied'; proposal: Refinement.Proposal; applied: AppliedArtifact[]; staleMarked: string[]; opResults: OpResult[] }
  | { outcome: 'conflicted'; proposal: Refinement.Proposal };

/** A draft the proposal's own content ops rewrote is approved at the revision they wrote — the prose the author reviewed in the proposal. */
export function bindApprovalRevision(op: ActionOp, applied: readonly AppliedArtifact[]): ActionOp {
  if (op.op !== 'action.approve_draft') return op;
  const written = applied.find(artifact => artifact.artifactRef === `draft:${op.chapter}`);
  return typeof written?.newRevision === 'number' ? { ...op, revision: written.newRevision, saveSeq: written.newSaveSeq, draftId: written.newDraftId?.toString() } : op;
}

/**
 * The one-way doors: finalize locks prose, so it is not covered by the revert guarantee. A blanket apply refuses them, so the author must
 * select the op's own index to walk through the door.
 */
const ONE_WAY_DOORS: Partial<Record<ActionOp['op'], ErrorCode>> = {
  'action.finalize': AppErrorCode.RFN_009,
  'action.approve_draft': AppErrorCode.DRF_009,
  'action.generate_chapter': AppErrorCode.DRF_014,
  'action.advance_volume': AppErrorCode.VOL_004,
};

/**
 * A volume can be removed only once no brief names it, and a milestone only once no plan claims it and no fact's unlock names it; a
 * change-set may list the op that lets go of either after the removal, as may the inverse of one that listed the new record after the op
 * that took it up. Removals therefore run last, volumes then milestones, every other op in its listed order.
 */
export function removalsLast<T extends { op: string }>(ops: readonly T[]): T[] {
  const removal = (kind: string) => ops.filter(op => op.op === kind);
  return [...ops.filter(op => op.op !== 'volume.remove' && op.op !== 'milestone.remove'), ...removal('volume.remove'), ...removal('milestone.remove')];
}

const PLAN_STATE_OPS: ReadonlySet<string> = new Set([
  'brief.update',
  'brief.remove',
  'volume.upsert',
  'volume.remove',
  'fact.upsert',
  'fact.remove',
  'milestone.upsert',
  'milestone.remove',
]);

/** A chat turn's applied proposal: the only kind whose changes are undone and redone one at a time. */
const PER_OP_UNDO_KINDS: ReadonlySet<Refinement.Kind> = new Set(['chat', 'hub']);

interface TurnOp {
  proposal: Refinement.Proposal;
  ops: ChangeOp[];
  opUndo: (OpUndoRecord | null)[];
  opResults: OpResult[];
  op: ContentOp;
  record: OpUndoRecord;
  result: OpResult;
}

/** Whether every ref holds the expected content; revisions are left out, since a restore bumps them. */
function sameContent(refs: readonly string[], expected: Readonly<Record<string, ArtifactState>>, actual: Readonly<Record<string, ArtifactState>>): boolean {
  return refs.every(ref => {
    const want = expected[ref];
    const found = actual[ref] ?? MISSING_ARTIFACT;
    return want !== undefined && want.exists === found.exists && want.contentHash === found.contentHash;
  });
}

/** The change-set indexes in the order an apply runs their ops. */
function applyOrder(ops: readonly ChangeOp[], indexes: readonly number[]): number[] {
  return removalsLast(indexes.map(index => ({ op: (ops[index] as ChangeOp).op, index }))).map(entry => entry.index);
}

/** Plans, and the facts, volumes and milestones their reveal rule reads, are checked as the whole change-set leaves them, so one op may rely on another. */
async function enforcePlanOps(tx: PrimaryDatabase, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  if (!ops.some(op => PLAN_STATE_OPS.has(op.op))) return;
  const written = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  await enforcePlanWrite(tx, projectId, written);
}

/** A plan pass plans only the next chapter, so its card goes out of date once a draft moves the story past the chapter it planned. */
async function assertPlanCardCurrent(tx: PrimaryDatabase, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  const planned = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  if (planned.length === 0) return;
  const next = await nextWritableChapter(tx, projectId);
  const stale = planned.find(chapter => chapter !== next);
  if (stale !== undefined) throw AppErrorCode.PLN_008.create({ chapter: String(stale), next: String(next) });
}

/** The one gate between an op and the artifact it edits: its rationale and quote explain the change to the author and are never stored beside the content they describe. */
function withoutMetadata<T extends ChangeOp>(op: T): T {
  if (!OP_METADATA_FIELDS.some(field => field in op)) return op;
  const rest = { ...op } as Record<string, unknown>;
  for (const field of OP_METADATA_FIELDS) delete rest[field];
  return rest as T;
}

@Injectable()
export class ProposalApplyService {
  private readonly logger = Logger.getLogger(APP_NAME, ProposalApplyService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly actionRegistry: ActionExecutorRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Applies a pending proposal: lock, per-op selection (cherry-pick),
   * baseline conflict check over the selected refs, guarded op dispatch with inverse capture,
   * staleness propagation, audit. Content ops are transactional; selected actions execute after
   * commit, sequentially, with their outcomes folded into opResults. An automatic apply carries content ops only, and a blanket apply
   * refuses the one-way doors. On its own transaction, a
   * baseline mismatch commits only the `conflicted` status flip and surfaces as HTTP 409; any other
   * failure rolls the whole transaction back and leaves the proposal pending. With `options.tx`
   * everything runs inside the caller's transaction instead: the 409 is thrown with the flip still
   * uncommitted, so it persists only if the caller catches the error and commits anyway, and action
   * ops are refused because nothing has committed for them to run after.
   */
  async apply(projectId: bigint, proposalId: bigint, options?: ApplyOptions): Promise<ApplyResult> {
    this.logger.debug('apply: starting', { projectId, proposalId, opIndexes: options?.opIndexes, autoApplied: options?.autoApplied });
    const applyInTransaction = async (tx: PrimaryTransaction): Promise<TxResult> => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw AppErrorCode.RFN_001.create();
      if (proposal.status !== 'pending') throw AppErrorCode.RFN_002.create();

      const ops = proposal.changeSet as ChangeOp[];
      const auditSelection = proposal.kind === 'bible_audit' ? await auditCardSelection(tx, proposal.id, options?.opIndexes) : undefined;
      const organiseSelection = options?.opIndexes ? undefined : wholeOrganiseSelection(proposal);
      const selected = this.resolveSelection(ops, auditSelection ?? organiseSelection ?? options?.opIndexes);
      const selectedOps = selected.map(index => ({ index, op: ops[index] as ChangeOp }));
      const contentOps = selectedOps.filter((s): s is { index: number; op: ContentOp } => !isActionOp(s.op));
      const selectedActions = selectedOps.filter((s): s is { index: number; op: ActionOp } => isActionOp(s.op));

      if (options?.tx && selectedActions.length > 0) throw AppError.internal('action ops cannot run inside a caller transaction');

      if (options?.autoApplied && selectedActions.length > 0) throw AppError.internal('an automatic apply carries content ops only — actions are always the author’s selection');
      const alwaysCard = options?.autoApplied ? contentOps.find(({ op }) => ALWAYS_CARD[op.op] !== undefined) : undefined;
      if (alwaysCard) throw AppError.internal(`an automatic apply never carries ${alwaysCard.op.op} — the write policy keeps it a card for the author`);
      const door = options?.opIndexes ? undefined : selectedActions.map(action => ONE_WAY_DOORS[action.op.op]).find(code => code !== undefined);
      if (door) throw door.create();

      for (const action of selectedActions) {
        if (!this.actionRegistry.has(action.op.op)) throw AppErrorCode.RFN_008.create();
      }

      const baseline = proposal.baseline as Record<string, ArtifactState>;
      const mismatches = await this.findBaselineMismatches(
        tx as unknown as PrimaryDatabase,
        projectId,
        contentOps.map(c => c.op),
        baseline,
      );
      if (mismatches.length > 0) {
        this.logger.warn('apply: baseline conflict — artifact changed since the proposal was staged', {
          projectId,
          proposalId,
          conflictedRefs: mismatches.map(m => m.artifactRef),
        });
        const [conflicted] = await tx
          .update(schema.refinementProposals)
          .set({ status: 'conflicted', error: { mismatches }, updatedAt: new Date() })
          .where(eq(schema.refinementProposals.id, proposal.id))
          .returning();
        return { outcome: 'conflicted', proposal: conflicted ?? proposal };
      }

      if (options?.opSources && options.opSources.length !== ops.length) throw AppError.internal('an automatic apply carries one source per op of its change-set');

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      const inverseOps: ContentOp[] = [];
      const perOpUndo = options?.autoApplied === true && PER_OP_UNDO_KINDS.has(proposal.kind);
      const opUndo: (OpUndoRecord | null)[] = ops.map(() => null);
      const indexOf = new Map<ChangeOp, number>(contentOps.map(entry => [entry.op, entry.index]));
      const selectedContent = contentOps.map(entry => entry.op);
      if (selectedContent.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      if (proposal.kind === 'chapter_plan') await assertPlanCardCurrent(ctx.tx, projectId, selectedContent);
      for (const op of removalsLast(selectedContent)) {
        const beforeState = perOpUndo ? await loadArtifactStates(ctx.tx, projectId, changeSetRefs([op])) : {};
        const inverse = await this.captureInverse(ctx, op);
        await this.applyOp(ctx, op);
        if (!inverse) continue;
        inverseOps.unshift(inverse);
        opUndo[indexOf.get(op) as number] = { inverse, beforeState };
      }
      await enforcePlanOps(ctx.tx, projectId, selectedContent);
      const postState = await loadArtifactStates(ctx.tx, projectId, changeSetRefs(contentOps.map(c => c.op)));

      const opResults = this.opResultsFor(ops, selected, options?.opSources);

      const [applied] = await tx
        .update(schema.refinementProposals)
        .set({
          status: 'applied',
          autoApplied: options?.autoApplied ?? false,
          opResults,
          inverseOps,
          postState,
          opUndo: perOpUndo ? opUndo : null,
          appliedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!applied) throw AppErrorCode.RFN_001.create();
      await recordOrganiseDecision(tx, projectId, proposal, selected);

      await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposal.id), disposition: 'approved', note: proposal.summary });
      const declined = opResults.filter(r => r.status === 'declined');
      if (declined.length > 0) {
        await tx.insert(schema.userFeedback).values({
          projectId,
          artifactType: 'refinement_proposal',
          artifactRef: String(proposal.id),
          disposition: 'rejected',
          note: `declined ops: ${declined.map(r => r.index).join(', ')}`,
        });
      }

      return { outcome: 'applied', proposal: applied, applied: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)], opResults };
    };
    const result = options?.tx ? await applyInTransaction(options.tx) : await this.db.transaction(applyInTransaction);

    if (result.outcome === 'conflicted') throw AppErrorCode.RFN_003.create();

    const ops = result.proposal.changeSet as ChangeOp[];
    const pendingActions = result.opResults.filter(r => r.status === 'pending').map(r => ({ index: r.index, op: bindApprovalRevision(ops[r.index] as ActionOp, result.applied) }));
    const { opResults, proposal } = await this.executeActions(projectId, result.proposal, result.opResults, pendingActions);

    this.logger.info(`proposal ${proposalId} applied: ${result.applied.map(a => a.artifactRef).join(', ') || 'actions only'}`);
    return { proposal, applied: result.applied, staleMarked: result.staleMarked, opResults };
  }

  private opResultsFor(ops: ChangeOp[], selected: number[], sources?: readonly OpSource[]): OpResult[] {
    return ops.map((op, index): OpResult => {
      if (!selected.includes(index)) return { index, status: 'declined' };
      const source = sources?.[index];
      return { index, status: isActionOp(op) ? 'pending' : 'applied', ...(source ? { source } : {}) };
    });
  }

  /** Validates a cherry-pick selection (RFN_011) and resolves the effective op indexes, in op order. */
  private resolveSelection(ops: ChangeOp[], opIndexes?: number[]): number[] {
    if (!opIndexes) return ops.map((_, index) => index);
    const unique = [...new Set(opIndexes)].sort((a, b) => a - b);
    const valid = unique.length > 0 && unique.every(index => Number.isInteger(index) && index >= 0 && index < ops.length);
    if (!valid) throw AppErrorCode.RFN_011.create();
    return unique;
  }

  /**
   * Runs the selected actions after the content transaction committed (they enqueue jobs and run AI
   * chains — no DB transaction can span them). Sequential and fail-fast: a failed action records its
   * error and stops the rest; already-applied content stays applied.
   */
  private async executeActions(
    projectId: bigint,
    proposal: Refinement.Proposal,
    opResults: OpResult[],
    actions: { index: number; op: ActionOp }[],
  ): Promise<{ proposal: Refinement.Proposal; opResults: OpResult[] }> {
    if (actions.length === 0) return { proposal, opResults };

    const costTier = await this.turnCostTier(proposal);
    const results = [...opResults];
    let failed = false;
    for (const { index, op } of actions) {
      const entry = results.find(r => r.index === index) as OpResult;
      if (failed) {
        entry.status = 'failed';
        entry.error = 'skipped — a previous action failed';
        continue;
      }
      // Presence was verified pre-commit inside the transaction (RFN_008), so the lookup cannot miss.
      const executor = this.actionRegistry.get(op.op) as ActionExecutor;
      try {
        const execute = (): Promise<ActionExecutionResult> =>
          executor(projectId, op, { proposalId: proposal.id, opIndex: index, sessionId: proposal.sessionId, messageId: proposal.messageId });
        const outcome = await (costTier ? runWithCostTier(costTier, execute) : execute());
        entry.status = 'applied';
        entry.result = outcome as unknown as Record<string, unknown>;
      } catch (err) {
        failed = true;
        entry.status = 'failed';
        entry.error = err instanceof Error ? err.message : String(err);
        this.logger.error(`action ${op.op} failed for proposal ${proposal.id}`, { err });
      }
    }

    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ opResults: results, error: failed ? { actionFailure: true } : null, updatedAt: new Date() })
      .where(eq(schema.refinementProposals.id, proposal.id))
      .returning();
    return { proposal: updated ?? proposal, opResults: results };
  }

  /**
   * The tier of the chat turn that staged the proposal, so the actions it proposed run at the tier the author chose for that turn — also
   * when the author applies them later. Anything else leaves the caller's scope, and failing that the project's tier, in charge.
   */
  private async turnCostTier(proposal: Refinement.Proposal): Promise<Project.CostTier | undefined> {
    if (!proposal.runId) return undefined;
    const [run] = await this.db
      .select({ costTier: sql<string | null>`${schema.workflowRuns.input}->>'costTier'` })
      .from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.id, proposal.runId), eq(schema.workflowRuns.graph, CHAT_TURN_GRAPH)));
    return isCostTier(run?.costTier) ? run.costTier : undefined;
  }

  private async findBaselineMismatches(tx: PrimaryDatabase, projectId: bigint, ops: ChangeOp[], baseline: Record<string, ArtifactState>): Promise<BaselineMismatch[]> {
    const refs = changeSetRefs(ops);
    const current = await loadArtifactStates(tx, projectId, refs);

    const mismatches: BaselineMismatch[] = [];
    for (const ref of refs) {
      const expected = baseline[ref];
      const actual = current[ref] as ArtifactState;
      // A ref missing from the baseline means the change-set grew without re-capture — treat as conflict.
      if (!expected) {
        mismatches.push({ artifactRef: ref, expected, actual });
        continue;
      }
      const changed = expected.exists !== actual.exists || expected.revision !== actual.revision || expected.contentHash !== actual.contentHash;
      if (changed) mismatches.push({ artifactRef: ref, expected, actual });
    }
    return mismatches;
  }

  /**
   * Synthesizes the op that would undo `op`, from the row state as it stands right now — called
   * immediately before the op executes, inside the same transaction. Upserts
   * over existing rows invert to upserts of the prior refinable fields; creations invert to removes;
   * removes invert to upserts of the deleted content.
   */
  private captureInverse(ctx: ApplyContext, op: ContentOp): Promise<ContentOp | null> {
    switch (op.op) {
      case 'premise.update':
        return this.inversePremiseUpdate(ctx, op);
      case 'bible_document.upsert':
      case 'bible_document.remove':
        return this.inverseBibleDoc(ctx, op);
      case 'volume.upsert':
      case 'volume.remove':
        return this.inverseVolume(ctx, op);
      case 'brief.update':
      case 'brief.remove':
        return this.inverseBrief(ctx, op);
      case 'draft.update':
      case 'draft.remove':
        return this.inverseDraft(ctx, op);
      case 'entity.upsert':
      case 'entity.remove':
        return this.inverseEntity(ctx, op);
      case 'fact.upsert':
      case 'fact.remove':
        return this.inverseFact(ctx, op);
      case 'milestone.upsert':
      case 'milestone.remove':
        return this.inverseMilestone(ctx, op);
      case 'promise.create':
      case 'promise.update':
      case 'promise.set_payoff':
      case 'promise.drop':
        return this.inversePromise(ctx, op);
      case 'organise.rule':
        return Promise.resolve(null);
    }
  }

  private async inversePremiseUpdate(ctx: ApplyContext, op: PremiseUpdateOp): Promise<ContentOp | null> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) return null;
    const inverse: PremiseRestoreOp = { op: 'premise.update' };
    if (op.premise !== undefined) inverse.premise = project.premise;
    if (op.brief !== undefined) inverse.brief = project.brief;
    if (op.themes !== undefined) inverse.themes = project.themes as string[] | null;
    if (op.instructions !== undefined) inverse.instructions = project.instructions;
    return inverse as ContentOp;
  }

  private async inverseBibleDoc(ctx: ApplyContext, op: BibleDocumentUpsertOp | BibleDocumentRemoveOp): Promise<ContentOp | null> {
    const doc = await ctx.tx.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)),
    });
    if (!doc) return op.op === 'bible_document.upsert' ? { op: 'bible_document.remove', section: op.section, slug: op.slug } : null;
    const inverse: BibleDocumentRestoreOp = {
      op: 'bible_document.upsert',
      section: op.section,
      slug: op.slug,
      frontmatter: doc.frontmatter as Record<string, unknown> | null,
      body: doc.body,
    };
    return inverse as ContentOp;
  }

  private async inverseVolume(ctx: ApplyContext, op: VolumeUpsertOp | VolumeRemoveOp): Promise<ContentOp | null> {
    const volume = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!volume) return op.op === 'volume.upsert' ? { op: 'volume.remove', volumeKey: op.volumeKey } : null;
    const inverse: VolumeRestoreOp = { op: 'volume.upsert', volumeKey: op.volumeKey, ordinal: volume.ordinal, title: volume.title, objective: volume.objective, body: volume.body };
    return inverse as ContentOp;
  }

  private async inverseBrief(ctx: ApplyContext, op: BriefUpdateOp | BriefRemoveOp): Promise<ContentOp | null> {
    const brief = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });
    if (!brief) return op.op === 'brief.update' ? { op: 'brief.remove', chapter: op.chapter } : null;
    const inverse: BriefRestoreOp = {
      op: 'brief.update',
      chapter: op.chapter,
      title: brief.title,
      body: brief.body,
      volumeKey: brief.volumeKey,
      writeMode: brief.writeMode,
      handEdited: brief.handEdited,
      contextRefs: brief.contextRefs as string[] | null,
      pov: brief.pov,
      chapterPurpose: brief.chapterPurpose,
      readerValue: brief.readerValue as string[] | null,
      repetitionRisks: brief.repetitionRisks,
      densityRisk: brief.densityRisk,
      endingContract: brief.endingContract as BriefUpdateOp['endingContract'] | null,
      // Always explicit: an omitted contract would merge as "keep", leaving a reverted reveal in place.
      knowledgeContract: (brief.knowledgeContract as BriefUpdateOp['knowledgeContract']) ?? null,
      direction: brief.direction,
      contentMode: brief.contentMode,
      scenes: brief.scenes,
      claimedMilestones: brief.claimedMilestones,
      isEnding: brief.isEnding,
    };
    return inverse as ContentOp;
  }

  private async inverseDraft(ctx: ApplyContext, op: DraftUpdateOp | DraftRemoveOp): Promise<ContentOp | null> {
    const draft = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (!draft) return op.op === 'draft.update' ? { op: 'draft.remove', chapter: op.chapter } : null;
    const inverse: DraftRestoreOp = {
      op: 'draft.update',
      chapter: op.chapter,
      title: draft.title,
      body: draft.body,
      summary: draft.summary,
      isolated: draft.isolated,
      generator: draft.generator,
    };
    return inverse as ContentOp;
  }

  private async inverseEntity(ctx: ApplyContext, op: EntityUpsertOp | EntityRemoveOp): Promise<ContentOp | null> {
    const entity = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!entity) return op.op === 'entity.upsert' ? { op: 'entity.remove', entityKey: op.entityKey } : null;
    const inverse: EntityRestoreOp = {
      op: 'entity.upsert',
      entityKey: op.entityKey,
      type: entity.type as EntityUpsertOp['type'],
      name: entity.name,
      status: entity.status,
      motivation: entity.motivation,
      notes: entity.notes,
      body: entity.body,
    };
    return inverse as ContentOp;
  }

  private async inverseFact(ctx: ApplyContext, op: FactUpsertOp | FactRemoveOp): Promise<ContentOp | null> {
    const fact = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!fact) return op.op === 'fact.upsert' ? { op: 'fact.remove', factKey: op.factKey } : null;
    const inverse: FactRestoreOp = {
      op: 'fact.upsert',
      factKey: op.factKey,
      body: fact.text,
      subjects: fact.subjects as string[] | null,
      constraintNote: fact.constraintNote,
      writerNote: fact.writerNote ?? '',
      terms: fact.terms as string[] | null,
      // Always explicit: an omitted schedule would merge as "keep", leaving a reverted date in place.
      revealChapter: fact.revealChapter,
      unlock: fact.unlock,
      allowedClues: fact.allowedClues,
    };
    return inverse as ContentOp;
  }

  private async inverseMilestone(ctx: ApplyContext, op: MilestoneUpsertOp | MilestoneRemoveOp): Promise<ContentOp | null> {
    const milestone = await ctx.tx.query.milestones.findFirst({
      where: and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)),
    });
    if (!milestone) return op.op === 'milestone.upsert' ? { op: 'milestone.remove', milestoneKey: op.milestoneKey } : null;
    const inverse: MilestoneRestoreOp = {
      op: 'milestone.upsert',
      milestoneKey: op.milestoneKey,
      label: milestone.label,
      subjectEntityKey: milestone.subjectEntityKey,
      kind: milestone.kind,
      reachedChapter: milestone.reachedChapter,
      boundRevision: milestone.boundRevision,
    };
    return inverse;
  }

  private async findPromiseRow(ctx: ApplyContext, kind: PromiseKind, key: string): Promise<PromiseRow | null> {
    if (kind === 'thread') {
      const where = and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, key));
      await ctx.tx.select({ id: schema.plotThreads.id }).from(schema.plotThreads).where(where).for('update');
      const row = await ctx.tx.query.plotThreads.findFirst({ where });
      return row
        ? {
            label: row.summary,
            status: row.status,
            chapterColumn: row.closedChapter,
            lastAdvancedChapter: row.lastAdvancedChapter,
            payoffMilestoneKey: row.payoffMilestoneKey,
            payoffVolumeKey: row.payoffVolumeKey,
            payoffWindow: row.payoffWindow,
            intentionallyOpen: row.intentionallyOpen,
          }
        : null;
    }
    const where = and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, key));
    await ctx.tx.select({ id: schema.mysteries.id }).from(schema.mysteries).where(where).for('update');
    const row = await ctx.tx.query.mysteries.findFirst({ where });
    return row
      ? {
          label: row.question,
          status: row.status,
          chapterColumn: row.resolvedChapter,
          lastAdvancedChapter: row.lastAdvancedChapter,
          payoffMilestoneKey: row.payoffMilestoneKey,
          payoffVolumeKey: row.payoffVolumeKey,
          payoffWindow: row.payoffWindow,
          intentionallyOpen: row.intentionallyOpen,
        }
      : null;
  }

  /** The highest chapter number that exists at all, drafted or finalized — the bound a promise's `lastAdvancedChapter` may not pass. */
  private async latestChapterNumber(ctx: ApplyContext): Promise<number> {
    const chapter = await ctx.tx.query.chapters.findFirst({
      where: eq(schema.chapters.projectId, ctx.projectId),
      orderBy: desc(schema.chapters.number),
      columns: { number: true },
    });
    const draft = await ctx.tx.query.drafts.findFirst({ where: eq(schema.drafts.projectId, ctx.projectId), orderBy: desc(schema.drafts.chapter), columns: { chapter: true } });
    return Math.max(chapter?.number ?? 0, draft?.chapter ?? 0);
  }

  /** A dropped promise's row is kept (drop never deletes), so only a create's inverse ever hard-deletes — nothing existed before it. */
  private async inversePromise(ctx: ApplyContext, op: PromiseCreateOp | PromiseUpdateOp | PromiseSetPayoffOp | PromiseDropOp): Promise<ContentOp | null> {
    const row = await this.findPromiseRow(ctx, op.kind, op.key);
    if (!row) {
      if (op.op !== 'promise.create') return null;
      const inverse: PromiseDropRestoreOp = { op: 'promise.drop', kind: op.kind, key: op.key, hardDelete: true };
      return inverse;
    }
    if (op.op === 'promise.set_payoff') {
      const inverse: PromiseSetPayoffOp = {
        op: 'promise.set_payoff',
        kind: op.kind,
        key: op.key,
        payoffMilestoneKey: row.payoffMilestoneKey,
        payoffVolumeKey: row.payoffVolumeKey,
        payoffWindow: row.payoffWindow,
        dormant: row.intentionallyOpen,
      };
      return inverse;
    }
    const inverse: PromiseUpdateRestoreOp = {
      op: 'promise.update',
      kind: op.kind,
      key: op.key,
      restoreLabel: row.label,
      restoreLastAdvancedChapter: row.lastAdvancedChapter,
      restoreStatus: row.status,
      restoreChapterColumn: row.chapterColumn,
    };
    return inverse;
  }

  private applyOp(ctx: ApplyContext, incoming: ChangeOp): Promise<void> {
    const op = withoutMetadata(incoming);
    switch (op.op) {
      case 'premise.update':
        return this.applyPremiseUpdate(ctx, op);
      case 'bible_document.upsert':
        return this.applyBibleDocUpsert(ctx, op);
      case 'bible_document.remove':
        return this.applyBibleDocRemove(ctx, op);
      case 'volume.upsert':
        return this.applyVolumeUpsert(ctx, op);
      case 'volume.remove':
        return this.applyVolumeRemove(ctx, op);
      case 'brief.update':
        return this.applyBriefUpdate(ctx, op);
      case 'brief.remove':
        return this.applyBriefRemove(ctx, op);
      case 'draft.update':
        return this.applyDraftUpdate(ctx, op);
      case 'draft.remove':
        return this.applyDraftRemove(ctx, op);
      case 'entity.upsert':
        return this.applyEntityUpsert(ctx, op);
      case 'entity.remove':
        return this.applyEntityRemove(ctx, op);
      case 'fact.upsert':
        return this.applyFactUpsert(ctx, op);
      case 'fact.remove':
        return this.applyFactRemove(ctx, op);
      case 'milestone.upsert':
        return this.applyMilestoneUpsert(ctx, op);
      case 'milestone.remove':
        return this.applyMilestoneRemove(ctx, op);
      case 'promise.create':
        return this.applyPromiseCreate(ctx, op);
      case 'promise.update':
        return this.applyPromiseUpdate(ctx, op);
      case 'promise.set_payoff':
        return this.applyPromiseSetPayoff(ctx, op);
      case 'promise.drop':
        return this.applyPromiseDrop(ctx, op);
      case 'organise.rule':
        return Promise.resolve();
      default:
        // Actions never reach the content dispatcher — they are filtered out before apply and executed
        // post-commit. Reaching here is a programming error, not bad input.
        throw AppErrorCode.RFN_004.create();
    }
  }

  private async applyPremiseUpdate(ctx: ApplyContext, op: PremiseRestoreOp): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (op.premise !== undefined) update['premise'] = op.premise;
    if (op.brief !== undefined) update['brief'] = op.brief;
    if (op.themes !== undefined) update['themes'] = op.themes;
    if (op.instructions !== undefined) update['instructions'] = writingInstructionAdditions(op.instructions);

    await ctx.tx.update(schema.projects).set(update).where(eq(schema.projects.id, ctx.projectId));
    ctx.applied.push({ artifactRef: 'premise', newRevision: null });
  }

  // Deliberately does not derive a title into frontmatter here: this op also replays as an inverse op
  // on revert/rollback, and that replay must restore the prior row's exact frontmatter, byte for byte.
  private async applyBibleDocUpsert(ctx: ApplyContext, op: BibleDocumentRestoreOp): Promise<void> {
    const contentHash = computeBibleDocHash(op.frontmatter, op.body);
    const [row] = await ctx.tx
      .insert(schema.bibleDocuments)
      .values({ projectId: ctx.projectId, section: op.section, slug: op.slug, frontmatter: op.frontmatter, body: op.body, contentHash, revision: 1 })
      .onConflictDoUpdate({
        target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
        set: { frontmatter: op.frontmatter, body: op.body, contentHash, revision: sql`${schema.bibleDocuments.revision} + 1`, updatedAt: new Date() },
        setWhere: sql`${schema.bibleDocuments.contentHash} is distinct from ${contentHash}`,
      })
      .returning();

    // A canon change can affect any chapter — same invalidation as BibleDocumentService.upsert.
    if (row) await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));

    const revision = row?.revision ?? (await this.currentDocRevision(ctx, op.section, op.slug));
    ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: revision });
  }

  private async currentDocRevision(ctx: ApplyContext, section: BibleDocumentUpsertOp['section'], slug: string): Promise<number | null> {
    const doc = await ctx.tx.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
    });
    return doc?.revision ?? null;
  }

  private async applyBibleDocRemove(ctx: ApplyContext, op: BibleDocumentRemoveOp): Promise<void> {
    const deleted = await ctx.tx
      .delete(schema.bibleDocuments)
      .where(and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.DOC_001.create();

    await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));
    ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: null });
  }

  private async applyVolumeUpsert(ctx: ApplyContext, op: VolumeRestoreOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });

    const merged = {
      ordinal: op.ordinal ?? existing?.ordinal ?? 0,
      title: keptOr(op.title, existing?.title),
      objective: keptOr(op.objective, existing?.objective),
      body: keptOr(op.body, existing?.body),
      // Never from `op`: state moves only through action.advance_volume, so an upsert keeps an existing volume's state and starts a new one not_started.
      state: existing?.state ?? 'not_started',
    };
    const contentHash = volumeContentHash({ volumeKey: op.volumeKey, ...merged });

    let revision: number;
    if (existing) {
      revision = existing.revision + 1;
      await ctx.tx
        .update(schema.volumes)
        .set({ ...merged, revision, contentHash, updatedAt: new Date() })
        .where(eq(schema.volumes.id, existing.id));
    } else {
      revision = 1;
      await ctx.tx.insert(schema.volumes).values({ projectId: ctx.projectId, volumeKey: op.volumeKey, ...merged, revision, contentHash });
      await autoActivateVolume(ctx.tx, ctx.projectId);
    }
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: revision });
  }

  private async applyVolumeRemove(ctx: ApplyContext, op: VolumeRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!existing) throw AppErrorCode.VOL_001.create();
    const planned = await ctx.tx.query.briefs.findFirst({
      where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.volumeKey, op.volumeKey)),
      columns: { chapter: true },
    });
    if (planned) throw AppErrorCode.VOL_002.create({ chapter: String(planned.chapter) });

    await ctx.tx.delete(schema.volumes).where(eq(schema.volumes.id, existing.id));
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: null });
  }

  /** A plan at or behind the story cursor or the latest finalized chapter is part of canon's history. */
  private async assertPlanOpen(ctx: ApplyContext, chapter: number): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ columns: { id: true }, where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (chapter <= (await planFrontier(ctx.tx, ctx.projectId))) throw AppErrorCode.RFN_005.create();
  }

  private async applyBriefUpdate(ctx: ApplyContext, op: BriefRestoreOp): Promise<void> {
    await this.assertPlanOpen(ctx, op.chapter);

    const existing = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });

    // A missing brief is creatable — refinement is a first-class authoring path — but only with a body;
    // without one there is nothing for the chapter author to draft from.
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const creates = (field: unknown): boolean => !existing && field === undefined;
    const defaults = {
      volumeKey: creates(op.volumeKey) ? await nearestVolumeKey(ctx.tx, ctx.projectId, op.chapter) : null,
      contentMode: creates(op.contentMode) ? await defaultChapterMode(ctx.tx, ctx.projectId) : null,
    };
    const merged = mergeBriefUpdate(existing, op, defaults);
    const contentHash = briefContentHash({ ...existing, chapter: op.chapter, ...merged });
    const revision = (existing?.revision ?? 0) + 1;

    if (existing) {
      await ctx.tx
        .update(schema.briefs)
        .set({ ...merged, revision, contentHash, staleReason: null, handEdited: op.handEdited ?? true, updatedAt: new Date() })
        .where(eq(schema.briefs.id, existing.id));
    } else {
      await ctx.tx.insert(schema.briefs).values({ projectId: ctx.projectId, chapter: op.chapter, ...merged, revision, contentHash, handEdited: op.handEdited ?? true });
    }
    await resetApprovalForPlanChange(ctx.tx, ctx.projectId, op.chapter, existing, merged);
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: revision });
  }

  private async applyBriefRemove(ctx: ApplyContext, op: BriefRemoveOp): Promise<void> {
    await this.assertPlanOpen(ctx, op.chapter);

    const deleted = await ctx.tx
      .delete(schema.briefs)
      .where(and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
    await resetApprovalForPlanChange(ctx.tx, ctx.projectId, op.chapter, deleted[0], {});
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: null });
  }

  /**
   * Draft prose is chat-editable only while it is still a draft (chat-hub design decision 2): a final
   * draft or a chapter at/behind the story cursor is locked canon. Every edit lands as a
   * draft_revisions row (source chat_edited), so prose history survives independent of proposal revert.
   */
  private async applyDraftUpdate(ctx: ApplyContext, op: DraftRestoreOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_010.create();

    const body = normalizeLineEndings(op.body);
    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.RFN_010.create();
    if (!existing && body === undefined) throw AppErrorCode.RFN_004.create();
    if (existing?.isolated && body !== undefined && body !== existing.body) throw AppErrorCode.RFN_012.create();

    const merged = { title: keptOr(op.title, existing?.title), body: body ?? existing?.body ?? '', summary: keptOr(op.summary, existing?.summary) };

    let written: { id: bigint; revision: number; saveSeq: number } | undefined;
    if (existing) {
      [written] = await ctx.tx
        .update(schema.drafts)
        .set({ ...merged, revision: sql`${schema.drafts.revision} + 1`, reviewStatus: 'needs_review', staleReason: null, updatedAt: new Date() })
        .where(
          and(eq(schema.drafts.id, existing.id), eq(schema.drafts.revision, existing.revision), eq(schema.drafts.saveSeq, existing.saveSeq), ne(schema.drafts.status, 'final')),
        )
        .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
      if (!written) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
    } else {
      await assertStartsNextChapter(ctx.tx, ctx.projectId, op.chapter);
      [written] = await ctx.tx
        .insert(schema.drafts)
        .values({
          projectId: ctx.projectId,
          chapter: op.chapter,
          ...merged,
          status: 'draft',
          revision: 1,
          reviewStatus: 'needs_review',
          generator: op.generator ?? 'standard',
          isolated: op.isolated ?? false,
        })
        .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
      if (!written) throw AppErrorCode.DRF_001.create();
    }

    await ctx.tx
      .insert(schema.draftRevisions)
      .values({
        projectId: ctx.projectId,
        draftId: written.id,
        revision: written.revision,
        source: 'chat_edited',
        title: merged.title,
        body: merged.body,
        summary: merged.summary,
        isolated: existing?.isolated ?? op.isolated ?? false,
      })
      .onConflictDoNothing();
    await pruneDraftHistory(ctx.tx, { id: written.id, revision: written.revision, approvedRevision: existing?.approvedRevision ?? null });
    await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was chat_edited`);
    if (existing) await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: written.revision, newSaveSeq: written.saveSeq, newDraftId: written.id });
  }

  private async applyDraftRemove(ctx: ApplyContext, op: DraftRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (!existing) throw AppErrorCode.DRF_001.create();
    if (existing.status === 'final') throw AppErrorCode.RFN_010.create();

    const removed = await ctx.tx
      .delete(schema.drafts)
      .where(and(eq(schema.drafts.id, existing.id), ne(schema.drafts.status, 'final')))
      .returning({ id: schema.drafts.id });
    if (removed.length === 0) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
    await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was removed`);
    await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: null });
  }

  private async applyEntityUpsert(ctx: ApplyContext, op: EntityRestoreOp): Promise<void> {
    const existing = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!existing && !op.name) throw AppErrorCode.RFN_004.create();

    const merged = {
      type: op.type,
      name: op.name ?? existing?.name ?? op.entityKey,
      status: keptOr(op.status, existing?.status),
      motivation: keptOr(op.motivation, existing?.motivation),
      notes: keptOr(op.notes, existing?.notes),
      body: keptOr(op.body, existing?.body),
    };

    if (existing) {
      await ctx.tx
        .update(schema.entities)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.entities.id, existing.id));
    } else {
      await ctx.tx.insert(schema.entities).values({ projectId: ctx.projectId, entityKey: op.entityKey, ...merged, origin: 'generated' });
    }
    ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
  }

  private async applyEntityRemove(ctx: ApplyContext, op: EntityRemoveOp): Promise<void> {
    const deleted = await ctx.tx
      .delete(schema.entities)
      .where(and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
    ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
  }

  /** Mirrors FactService.upsert's field merge on the apply transaction — reveals stay out of the grammar. */
  private async applyFactUpsert(ctx: ApplyContext, op: FactRestoreOp): Promise<void> {
    const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const merged = {
      text: op.body ?? existing?.text ?? '',
      subjects: keptOr(op.subjects, existing?.subjects as string[] | null | undefined) as never,
      constraintNote: keptOr(op.constraintNote, existing?.constraintNote),
      writerNote: op.writerNote === undefined ? (existing?.writerNote ?? null) : op.writerNote.trim() || null,
      terms: keptOr(op.terms, existing?.terms as string[] | null | undefined) as never,
      revealChapter: op.revealChapter === undefined ? (existing?.revealChapter ?? null) : op.revealChapter,
      unlock: op.unlock === undefined ? (existing?.unlock ?? null) : op.unlock,
      allowedClues: op.allowedClues === undefined ? (existing?.allowedClues ?? null) : op.allowedClues && normalizeStringList(op.allowedClues),
    };
    const giveaways = changedCluesNamingTerms(existing, merged);
    if (giveaways.length > 0) throw AppErrorCode.FCT_006.create({ reason: giveaways.join('; ') });

    if (existing) {
      await ctx.tx
        .update(schema.canonFacts)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.canonFacts.id, existing.id));
    } else {
      await ctx.tx.insert(schema.canonFacts).values({ projectId: ctx.projectId, factKey: op.factKey, ...merged });
    }
    ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
  }

  /**
   * Deleting a fact cascades its knowledge ledger, and the inverse op restores only the fact row — so
   * a ledgered fact is refused rather than silently breaking the revert guarantee.
   * Retract the reveals first through the fact endpoints.
   */
  private async applyFactRemove(ctx: ApplyContext, op: FactRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!existing) throw AppErrorCode.FCT_001.create();

    const ledgered = await ctx.tx.query.characterKnowledge.findFirst({ where: eq(schema.characterKnowledge.factId, existing.id) });
    if (ledgered) throw AppErrorCode.FCT_003.create();

    await ctx.tx.delete(schema.canonFacts).where(eq(schema.canonFacts.id, existing.id));
    ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
  }

  private async applyMilestoneUpsert(ctx: ApplyContext, op: MilestoneRestoreOp): Promise<void> {
    const existing = await ctx.tx.query.milestones.findFirst({
      where: and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)),
    });
    if (!existing && !op.label?.trim()) throw AppErrorCode.RFN_004.create();
    const restoring = 'reachedChapter' in op;
    if (!restoring && op.subjectEntityKey?.trim() && op.subjectEntityKey.trim() !== existing?.subjectEntityKey)
      await assertMilestoneSubject(ctx.tx, ctx.projectId, op.subjectEntityKey.trim());

    const merged = {
      label: op.label?.trim() || existing?.label || op.milestoneKey,
      subjectEntityKey: op.subjectEntityKey === undefined ? (existing?.subjectEntityKey ?? null) : op.subjectEntityKey?.trim() || null,
      kind: op.kind ?? existing?.kind ?? 'custom',
    };
    if (existing) {
      await ctx.tx
        .update(schema.milestones)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.milestones.id, existing.id));
    } else {
      const reached =
        typeof op.reachedChapter === 'number'
          ? { state: 'reached' as const, plannedChapter: op.reachedChapter, reachedChapter: op.reachedChapter, boundRevision: op.boundRevision ?? null }
          : {};
      await ctx.tx.insert(schema.milestones).values({ projectId: ctx.projectId, milestoneKey: op.milestoneKey, ...merged, ...reached });
    }
    ctx.applied.push({ artifactRef: `milestone:${op.milestoneKey}`, newRevision: null });
  }

  private async applyMilestoneRemove(ctx: ApplyContext, op: MilestoneRemoveOp): Promise<void> {
    const references = await findMilestoneReferences(ctx.tx, ctx.projectId, op.milestoneKey);
    if (references.length > 0) throw AppErrorCode.MIL_003.create({ milestoneKey: op.milestoneKey, references: references.join(', ') });

    // A promise's payoff target dangling after the milestone goes is a soft inconsistency, not a correctness hazard like a claimed plan or a
    // fact's unlock — diagnostic only, so it never blocks the removal a claim or an unlock would.
    const namingThreads = await ctx.tx.query.plotThreads.findMany({
      columns: { threadKey: true },
      where: and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.payoffMilestoneKey, op.milestoneKey)),
    });
    const namingMysteries = await ctx.tx.query.mysteries.findMany({
      columns: { mysteryKey: true },
      where: and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.payoffMilestoneKey, op.milestoneKey)),
    });
    if (namingThreads.length > 0 || namingMysteries.length > 0) {
      this.logger.warn('applyMilestoneRemove: milestone named as a payoff target by promises that will be left pointing at nothing', {
        projectId: ctx.projectId,
        milestoneKey: op.milestoneKey,
        threads: namingThreads.map(t => t.threadKey),
        mysteries: namingMysteries.map(m => m.mysteryKey),
      });
    }

    const deleted = await ctx.tx
      .delete(schema.milestones)
      .where(and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.MIL_001.create();
    ctx.applied.push({ artifactRef: `milestone:${op.milestoneKey}`, newRevision: null });
  }

  private async applyPromiseCreate(ctx: ApplyContext, op: PromiseCreateOp): Promise<void> {
    const existing = await this.findPromiseRow(ctx, op.kind, op.key);
    if (existing) throw AppErrorCode.PMS_002.create({ kind: op.kind });
    const openedChapter = op.openedChapter ?? (await nextWritableChapter(ctx.tx, ctx.projectId));
    if (op.kind === 'thread') {
      await ctx.tx.insert(schema.plotThreads).values({ projectId: ctx.projectId, threadKey: op.key, status: 'open', summary: op.label, openedChapter });
    } else {
      await ctx.tx.insert(schema.mysteries).values({ projectId: ctx.projectId, mysteryKey: op.key, status: 'open', question: op.label, openedChapter });
    }
    ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
  }

  private async applyPromiseUpdate(ctx: ApplyContext, op: PromiseUpdateRestoreOp): Promise<void> {
    const existing = await this.findPromiseRow(ctx, op.kind, op.key);
    if (!existing) throw AppErrorCode.PMS_001.create();

    if (op.lastAdvancedChapter !== undefined) {
      const latest = await this.latestChapterNumber(ctx);
      if (op.lastAdvancedChapter > latest) throw AppErrorCode.PMS_003.create({ lastAdvancedChapter: String(op.lastAdvancedChapter), latest: String(latest) });
    }

    const label = op.restoreLabel !== undefined ? op.restoreLabel : op.label !== undefined ? op.label.trim() || existing.label || op.key : existing.label;
    const lastAdvancedChapter = op.restoreLastAdvancedChapter !== undefined ? op.restoreLastAdvancedChapter : (op.lastAdvancedChapter ?? existing.lastAdvancedChapter);
    const dbStatus: PromiseDbStatus =
      op.restoreStatus ?? (op.status === undefined ? existing.status : op.status === 'paid_off' ? (op.kind === 'thread' ? 'closed' : 'resolved') : op.status);
    // Paying off a promise stamps it with the chapter it happens in; reopening it clears that chapter; leaving status alone keeps it.
    const chapterColumn =
      op.restoreChapterColumn !== undefined
        ? op.restoreChapterColumn
        : op.status === undefined
          ? existing.chapterColumn
          : op.status === 'paid_off'
            ? await this.latestChapterNumber(ctx)
            : null;

    if (op.kind === 'thread') {
      await ctx.tx
        .update(schema.plotThreads)
        .set({ summary: label, lastAdvancedChapter, status: dbStatus as Story.ThreadStatus, closedChapter: chapterColumn, updatedAt: new Date() })
        .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
    } else {
      await ctx.tx
        .update(schema.mysteries)
        .set({
          question: (label ?? existing.label ?? op.key) as string,
          lastAdvancedChapter,
          status: dbStatus as Story.MysteryStatus,
          resolvedChapter: chapterColumn,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
    }
    ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
  }

  private async applyPromiseSetPayoff(ctx: ApplyContext, op: PromiseSetPayoffOp): Promise<void> {
    const existing = await this.findPromiseRow(ctx, op.kind, op.key);
    if (!existing) throw AppErrorCode.PMS_001.create();
    const merged = op.someday
      ? { payoffMilestoneKey: null, payoffVolumeKey: null, payoffWindow: null, intentionallyOpen: op.dormant ?? existing.intentionallyOpen }
      : {
          payoffMilestoneKey: op.payoffMilestoneKey !== undefined ? op.payoffMilestoneKey : existing.payoffMilestoneKey,
          payoffVolumeKey: op.payoffVolumeKey !== undefined ? op.payoffVolumeKey : existing.payoffVolumeKey,
          payoffWindow: op.payoffWindow !== undefined ? op.payoffWindow : existing.payoffWindow,
          intentionallyOpen: op.dormant ?? existing.intentionallyOpen,
        };
    if (op.kind === 'thread') {
      await ctx.tx
        .update(schema.plotThreads)
        .set({ ...merged, updatedAt: new Date() })
        .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
    } else {
      await ctx.tx
        .update(schema.mysteries)
        .set({ ...merged, updatedAt: new Date() })
        .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
    }
    ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
  }

  /** A drop is a status change, not a delete — the row (and its history) stays; only a captured inverse of a create hard-deletes. */
  private async applyPromiseDrop(ctx: ApplyContext, op: PromiseDropRestoreOp): Promise<void> {
    const existing = await this.findPromiseRow(ctx, op.kind, op.key);
    if (!existing) throw AppErrorCode.PMS_001.create();
    if (op.hardDelete) {
      if (op.kind === 'thread') await ctx.tx.delete(schema.plotThreads).where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
      else await ctx.tx.delete(schema.mysteries).where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
      ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
      return;
    }
    if (op.kind === 'thread') {
      await ctx.tx
        .update(schema.plotThreads)
        .set({ status: 'dropped', updatedAt: new Date() })
        .where(and(eq(schema.plotThreads.projectId, ctx.projectId), eq(schema.plotThreads.threadKey, op.key)));
    } else {
      await ctx.tx
        .update(schema.mysteries)
        .set({ status: 'dropped', updatedAt: new Date() })
        .where(and(eq(schema.mysteries.projectId, ctx.projectId), eq(schema.mysteries.mysteryKey, op.key)));
    }
    ctx.applied.push({ artifactRef: `promise:${op.kind}:${op.key}`, newRevision: null });
  }

  /**
   * Undoes an applied proposal by executing its stored inverse ops through the same appliers —
   * same hashing, revision bumps, and staleness propagation as any apply. Guarded
   * strictly: every artifact must still be exactly as the apply left it (postState); anything moved
   * on → 409 RFN_006, nothing touched. Revisions only ever move forward — a revert bumps them again
   * with the restored content, so later baselines stay coherent.
   */
  async revert(projectId: bigint, proposalId: bigint): Promise<RevertResult> {
    this.logger.debug('revert: starting', { projectId, proposalId });
    const result = await this.db.transaction(async tx => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw AppErrorCode.RFN_001.create();
      const inverseOps = (proposal.inverseOps ?? []) as ContentOp[];
      if (proposal.status !== 'applied' || (inverseOps.length === 0 && !hasOrganiseUndo(proposal))) throw AppErrorCode.RFN_007.create();

      // Content identity (exists + contentHash) is the guard — NOT revision: reverting a newer change
      // on the same artifact restores this proposal's content but bumps the revision counter, and a
      // rollback chain must keep walking backward through exactly that state.
      const postState = (proposal.postState ?? {}) as Record<string, ArtifactState>;
      const refs = Object.keys(postState);
      const current = await loadArtifactStates(tx as unknown as PrimaryDatabase, projectId, refs);
      const mismatches: BaselineMismatch[] = [];
      for (const ref of refs) {
        const expected = postState[ref] as ArtifactState;
        const actual = current[ref] as ArtifactState;
        const changed = expected.exists !== actual.exists || expected.contentHash !== actual.contentHash;
        if (changed) mismatches.push({ artifactRef: ref, expected, actual });
      }
      if (mismatches.length > 0) return { outcome: 'conflicted' as const, mismatches };

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      if (inverseOps.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      for (const op of removalsLast(inverseOps)) await this.applyOp(ctx, op);
      await enforcePlanOps(ctx.tx, projectId, inverseOps);
      await revertOrganiseDecision(tx, projectId, proposal);

      const [reverted] = await tx
        .update(schema.refinementProposals)
        .set({ status: 'reverted', revertedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!reverted) throw AppErrorCode.RFN_001.create();

      await tx.insert(schema.userFeedback).values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposal.id), disposition: 'rejected', note: 'reverted' });

      return { outcome: 'reverted' as const, proposal: reverted, reverted: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)] };
    });

    if (result.outcome === 'conflicted') throw AppErrorCode.RFN_006.create();
    this.logger.info(`proposal ${proposalId} reverted: ${result.reverted.map(a => a.artifactRef).join(', ')}`);
    return { proposal: result.proposal, reverted: result.reverted, staleMarked: result.staleMarked };
  }

  /**
   * Undoes one change of a chat turn's applied proposal through the inverse its apply captured, under the whole revert's conflict guard
   * over the records that change wrote. Refused while another applied change of the turn relies on it (RFN_015), listing them: undoing
   * them too would take back changes the author did not choose. The proposal stays applied; its `inverse_ops` and `post_state` narrow to
   * what is still applied, so undoing the rest as a whole keeps working.
   */
  async undoOp<T = never>(projectId: bigint, proposalId: bigint, opIndex: number, onUndone?: OpToggleHook<T>): Promise<OpToggleResult<T>> {
    const result = await this.db.transaction(async (tx): Promise<OpToggleResult<T>> => {
      const turn = await this.lockTurnOp(tx, projectId, proposalId, opIndex);
      if (turn.proposal.status === 'reverted' || turn.result.status === 'reverted') return this.unchanged(turn);
      if (turn.proposal.status !== 'applied') throw AppErrorCode.RFN_007.create();

      const { graph, applied } = this.appliedOpGraph(turn);
      const dependents = graph.dependents(opIndex, applied);
      if (dependents.length > 0) throw new OpDependencyError(AppErrorCode.RFN_015, opIndex, dependents);
      const refs = changeSetRefs([turn.op]);
      if (!(await this.statesMatch(tx, projectId, refs, turn.proposal.postState))) throw AppErrorCode.RFN_006.create();

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      const { inverse } = turn.record;
      if (PLAN_STATE_OPS.has(inverse.op)) await lockProjectPlan(tx, projectId);
      await this.applyOp(ctx, inverse);
      await enforcePlanOps(ctx.tx, projectId, [inverse]);
      const undoneState = await loadArtifactStates(ctx.tx, projectId, refs);
      if (!sameContent(refs, turn.record.beforeState, undoneState)) {
        this.logger.error('undoOp: the inverse did not restore the records as the apply found them', { projectId, proposalId, opIndex, refs });
        throw AppErrorCode.RFN_018.create({ opIndex: String(opIndex) });
      }
      const proposal = await this.settleTurnOp(tx, turn, 'reverted', { ...turn.record, undoneState }, undoneState);
      await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposalId), disposition: 'rejected', note: `undone op ${opIndex}` });
      const followUp = onUndone ? await onUndone(tx, { op: turn.op, source: turn.result.source }) : undefined;
      return { proposal, artifacts: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)], changed: true, op: turn.op, source: turn.result.source, followUp };
    });
    if (result.changed) this.logger.info('proposal op undone', { projectId, proposalId, opIndex, refs: result.artifacts.map(a => a.artifactRef) });
    return result;
  }

  /**
   * Applies again one change a per-change undo took back, capturing a fresh inverse, only while the rest of its turn stays applied (RFN_017),
   * the changes it relies on are back (RFN_016) and its records are exactly as the undo left them (RFN_003).
   */
  async redoOp<T = never>(projectId: bigint, proposalId: bigint, opIndex: number, onRedone?: OpToggleHook<T>): Promise<OpToggleResult<T>> {
    const result = await this.db.transaction(async (tx): Promise<OpToggleResult<T>> => {
      const turn = await this.lockTurnOp(tx, projectId, proposalId, opIndex);
      if (turn.proposal.status !== 'applied') throw AppErrorCode.RFN_017.create();
      if (turn.result.status === 'applied') return this.unchanged(turn);

      const { graph, applied, undone } = this.appliedOpGraph(turn);
      const prerequisites = graph.prerequisites(opIndex, undone, applied);
      if (prerequisites.length > 0) throw new OpDependencyError(AppErrorCode.RFN_016, opIndex, prerequisites);
      const refs = changeSetRefs([turn.op]);
      if (!(await this.statesMatch(tx, projectId, refs, turn.record.undoneState))) throw AppErrorCode.RFN_003.create();

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      if (PLAN_STATE_OPS.has(turn.op.op)) await lockProjectPlan(tx, projectId);
      const beforeState = await loadArtifactStates(ctx.tx, projectId, refs);
      const inverse = await this.captureInverse(ctx, turn.op);
      if (!inverse) throw AppError.internal(`redoing op ${opIndex} captured no inverse, so it could not be undone again`);
      await this.applyOp(ctx, turn.op);
      await enforcePlanOps(ctx.tx, projectId, [turn.op]);
      const redoneState = await loadArtifactStates(ctx.tx, projectId, refs);
      const proposal = await this.settleTurnOp(tx, turn, 'applied', { inverse, beforeState }, redoneState);
      await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposalId), disposition: 'approved', note: `redone op ${opIndex}` });
      const followUp = onRedone ? await onRedone(tx, { op: turn.op, source: turn.result.source }) : undefined;
      return { proposal, artifacts: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)], changed: true, op: turn.op, source: turn.result.source, followUp };
    });
    if (result.changed) this.logger.info('proposal op redone', { projectId, proposalId, opIndex, refs: result.artifacts.map(a => a.artifactRef) });
    return result;
  }

  private async lockTurnOp(tx: PrimaryTransaction, projectId: bigint, proposalId: bigint, opIndex: number): Promise<TurnOp> {
    const [proposal] = await tx
      .select()
      .from(schema.refinementProposals)
      .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
      .for('update');
    if (!proposal) throw AppErrorCode.RFN_001.create();
    const ops = proposal.changeSet as ChangeOp[];
    if (!Number.isInteger(opIndex) || opIndex < 0 || opIndex >= ops.length) throw AppErrorCode.RFN_011.create();

    const opUndo = proposal.opUndo as (OpUndoRecord | null)[] | null;
    const opResults = (proposal.opResults ?? []) as OpResult[];
    const record = opUndo?.[opIndex];
    const result = opResults.find(entry => entry.index === opIndex);
    const toggleable = result?.status === 'applied' || result?.status === 'reverted';
    if (!opUndo || !record || !result || !toggleable || !PER_OP_UNDO_KINDS.has(proposal.kind)) throw AppErrorCode.RFN_014.create({ opIndex: String(opIndex) });
    return { proposal, ops, opUndo, opResults, op: ops[opIndex] as ContentOp, record, result };
  }

  private unchanged<T>(turn: TurnOp): OpToggleResult<T> {
    return { proposal: turn.proposal, artifacts: [], staleMarked: [], changed: false, op: turn.op, source: turn.result.source };
  }

  private appliedOpGraph(turn: TurnOp): { graph: AppliedOpGraph; applied: number[]; undone: number[] } {
    const baseline = turn.proposal.baseline as Record<string, ArtifactState>;
    const existing = new Set(Object.keys(baseline).filter(ref => baseline[ref]?.exists));
    const content = turn.opResults.filter(entry => turn.opUndo[entry.index]);
    const withStatus = (status: OpResult['status']) => content.filter(entry => entry.status === status).map(entry => entry.index);
    const order = applyOrder(
      turn.ops,
      content.map(entry => entry.index),
    );
    return { graph: new AppliedOpGraph(turn.ops, existing, order), applied: withStatus('applied'), undone: withStatus('reverted') };
  }

  private async statesMatch(tx: PrimaryTransaction, projectId: bigint, refs: string[], expected: unknown): Promise<boolean> {
    const current = await loadArtifactStates(tx as unknown as PrimaryDatabase, projectId, refs);
    return sameContent(refs, (expected ?? {}) as Record<string, ArtifactState>, current);
  }

  /** Records one change's new state and narrows the whole revert's inverse and conflict guard to the changes still applied. */
  private async settleTurnOp(
    tx: PrimaryTransaction,
    turn: TurnOp,
    status: 'applied' | 'reverted',
    record: OpUndoRecord,
    opState: Record<string, ArtifactState>,
  ): Promise<Refinement.Proposal> {
    const index = turn.result.index;
    const opResults = turn.opResults.map(entry => (entry.index === index ? { ...entry, status } : entry));
    const opUndo = turn.opUndo.map((entry, at) => (at === index ? record : entry));
    const live = opResults.filter(entry => entry.status === 'applied' && opUndo[entry.index]).map(entry => entry.index);
    const inverseOps = applyOrder(turn.ops, live)
      .reverse()
      .map(at => (opUndo[at] as OpUndoRecord).inverse);
    const liveRefs = new Set(changeSetRefs(live.map(at => turn.ops[at] as ChangeOp)));
    const previous = Object.entries((turn.proposal.postState ?? {}) as Record<string, ArtifactState>).filter(([ref]) => !(ref in opState));
    const postState = Object.fromEntries([...previous, ...Object.entries(opState)].filter(([ref]) => liveRefs.has(ref)));

    const [updated] = await tx
      .update(schema.refinementProposals)
      .set({ opResults, opUndo, inverseOps, postState, updatedAt: new Date() })
      .where(eq(schema.refinementProposals.id, turn.proposal.id))
      .returning();
    if (!updated) throw AppErrorCode.RFN_001.create();
    return updated;
  }

  /**
   * Rolls the project back to the state right after `afterProposalId` was applied: every applied
   * proposal newer than the anchor is reverted, newest first, each in its own transaction. Action-only
   * proposals (nothing to invert) are skipped. Stops at the first conflict and reports how far it got.
   * Cross-session changes are included by design — the history is project-wide.
   */
  async rollbackAfter(projectId: bigint, afterProposalId: bigint): Promise<RollbackResult> {
    const anchor = await this.db.query.refinementProposals.findFirst({
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, afterProposalId)),
    });
    if (!anchor) throw AppErrorCode.RFN_001.create();
    if (!anchor.appliedAt) throw AppErrorCode.RFN_007.create();

    // The anchor's appliedAt stays in SQL — round-tripping it through a JS Date shifts timestamps
    // (timezone serialization) and corrupts the comparison. Ties on the same instant break by id.
    // Raw identifiers on purpose: drizzle column refs would leak the outer query's alias into the subquery.
    const anchorAppliedAt = sql`(select applied_at from refinement_proposals where id = ${afterProposalId})`;
    const newer = await this.db.query.refinementProposals.findMany({
      where: and(
        eq(schema.refinementProposals.projectId, projectId),
        eq(schema.refinementProposals.status, 'applied'),
        or(
          gt(schema.refinementProposals.appliedAt, anchorAppliedAt),
          and(eq(schema.refinementProposals.appliedAt, anchorAppliedAt), gt(schema.refinementProposals.id, afterProposalId)),
        ),
      ),
      orderBy: [desc(schema.refinementProposals.appliedAt), desc(schema.refinementProposals.id)],
    });

    const result: RollbackResult = { reverted: [], skipped: [] };
    for (const proposal of newer) {
      const inverseOps = (proposal.inverseOps ?? []) as ContentOp[];
      if (inverseOps.length === 0 && !hasOrganiseUndo(proposal)) {
        result.skipped.push(proposal.id);
        continue;
      }
      try {
        const reverted = await this.revert(projectId, proposal.id);
        result.reverted.push({ proposalId: proposal.id, artifacts: reverted.reverted });
      } catch (err) {
        result.stoppedAt = proposal.id;
        if (err instanceof RevealRuleError) result.conflict = { code: err.code, message: err.message, details: { violations: err.violations } };
        else if (AppError.is(err)) result.conflict = { code: err.code, message: err.message };
        else result.conflict = { message: err instanceof Error ? err.message : String(err) };
        break;
      }
    }
    return result;
  }
}
