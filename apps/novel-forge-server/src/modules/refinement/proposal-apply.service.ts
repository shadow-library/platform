import { and, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, type ErrorCode, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { auditCardSelection, lockProjectPlan, nextWritableChapter } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema } from '@server/database';

import { runWithCostTier } from '../ai/cost-tier-scope';
import { isCostTier } from '../ai/defaults';
import { recordOrganiseDecision, wholeOrganiseSelection } from '../notes/organise-record';
import { type ActionExecutionResult, type ActionExecutor, ActionExecutorRegistry } from './action-registry';
import {
  type AppliedArtifact,
  type ApplyContext,
  applyPassageRewrites,
  type BaselineMismatch,
  captureAndApply,
  enforcePlanOps,
  type OpResult,
  PER_OP_UNDO_KINDS,
  PLAN_STATE_OPS,
  removalsLast,
} from './apply';
import { type ArtifactState, loadArtifactStates } from './artifact-state';
import { CHAT_TURN_GRAPH } from './chat-selection';
import { type ActionOp, type ChangeOp, changeSetRefs, type ContentOp, type DraftRewritePassageOp, type DraftUpdateOp, isActionOp } from './change-set';
import { type OpUndoRecord } from './op-undo';
import { isPassageRewrite } from './passage-rewrite';
import { ALWAYS_CARD, type OpSource } from './write-policy';

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
  'action.apply_continuity': AppErrorCode.CNT_002,
  'action.generate_chapter': AppErrorCode.DRF_014,
  'action.advance_volume': AppErrorCode.VOL_004,
};

/**
 * Every selected rewrite of a chapter lands as one revision, so they are written together where the first of them stands. Staging refuses a
 * change-set that also rewrites one of those chapters whole, which the baseline check would otherwise wave through.
 */
function rewritesByChapter(ops: readonly ContentOp[]): Map<number, DraftRewritePassageOp[]> {
  const byChapter = new Map<number, DraftRewritePassageOp[]>();
  for (const op of ops) if (isPassageRewrite(op)) byChapter.set(op.chapter, [...(byChapter.get(op.chapter) ?? []), op]);
  const whole = ops.find(op => (op.op === 'draft.update' || op.op === 'draft.remove') && byChapter.has(op.chapter));
  if (whole) throw AppError.internal(`a change-set never rewrites chapter ${String((whole as DraftUpdateOp).chapter)} whole beside its passage rewrites`);
  return byChapter;
}

/** A plan pass plans only the next chapter, so its card goes out of date once a draft moves the story past the chapter it planned. */
async function assertPlanCardCurrent(tx: DbExecutor, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  const planned = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  if (planned.length === 0) return;
  const next = await nextWritableChapter(tx, projectId);
  const stale = planned.find(chapter => chapter !== next);
  if (stale !== undefined) throw AppErrorCode.PLN_008.create({ chapter: String(stale), next: String(next) });
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
        tx,
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

      const ctx: ApplyContext = { tx, projectId, applied: [], staleMarked: [] };
      const inverseOps: ContentOp[] = [];
      const perOpUndo = options?.autoApplied === true && PER_OP_UNDO_KINDS.has(proposal.kind);
      const opUndo: (OpUndoRecord | null)[] = ops.map(() => null);
      const indexOf = new Map<ChangeOp, number>(contentOps.map(entry => [entry.op, entry.index]));
      const selectedContent = contentOps.map(entry => entry.op);
      if (selectedContent.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      if (proposal.kind === 'chapter_plan') await assertPlanCardCurrent(ctx.tx, projectId, selectedContent);
      const rewrites = rewritesByChapter(selectedContent);
      for (const op of removalsLast(selectedContent)) {
        const chapterRewrites = isPassageRewrite(op) ? rewrites.get(op.chapter) : undefined;
        if (chapterRewrites && chapterRewrites[0] !== op) continue;
        const beforeState = perOpUndo ? await loadArtifactStates(ctx.tx, projectId, changeSetRefs([op])) : {};
        const inverse = chapterRewrites ? await applyPassageRewrites(ctx, chapterRewrites) : await captureAndApply(ctx, op);
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

  private async findBaselineMismatches(tx: DbExecutor, projectId: bigint, ops: ChangeOp[], baseline: Record<string, ArtifactState>): Promise<BaselineMismatch[]> {
    const refs = changeSetRefs(ops);
    const current = await loadArtifactStates(tx, projectId, refs);
    const passageOnly = new Set(refs.filter(ref => ops.every(op => !changeSetRefs([op]).includes(ref) || isPassageRewrite(op))));

    const mismatches: BaselineMismatch[] = [];
    for (const ref of refs) {
      const expected = baseline[ref];
      const actual = current[ref] as ArtifactState;
      // A ref missing from the baseline means the change-set grew without re-capture — treat as conflict.
      if (!expected) {
        mismatches.push({ artifactRef: ref, expected, actual });
        continue;
      }
      // A rewrite finds its own passage again at apply, so an edit elsewhere in the chapter leaves its card standing.
      const moved = !passageOnly.has(ref) && (expected.revision !== actual.revision || expected.contentHash !== actual.contentHash);
      if (expected.exists !== actual.exists || moved) mismatches.push({ artifactRef: ref, expected, actual });
    }
    return mismatches;
  }
}
