import { and, desc, eq, gt, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode, OpDependencyError, RevealRuleError } from '@server/classes';
import { lockProjectPlan } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type PrimaryTransaction, type Refinement, schema } from '@server/database';

import { hasOrganiseUndo, revertOrganiseDecision } from '../notes/organise-record';
import {
  type AppliedArtifact,
  applyContentOp,
  type ApplyContext,
  applyOrder,
  type BaselineMismatch,
  captureInverse,
  enforcePlanOps,
  type OpResult,
  PER_OP_UNDO_KINDS,
  PLAN_STATE_OPS,
  removalsLast,
  sameContent,
} from './apply';
import { type ArtifactState, loadArtifactStates } from './artifact-state';
import { type ChangeOp, changeSetRefs, type ContentOp } from './change-set';
import { AppliedOpGraph, type OpUndoRecord } from './op-undo';
import { type OpSource } from './write-policy';

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

interface TurnOp {
  proposal: Refinement.Proposal;
  ops: ChangeOp[];
  opUndo: (OpUndoRecord | null)[];
  opResults: OpResult[];
  op: ContentOp;
  record: OpUndoRecord;
  result: OpResult;
}

@Injectable()
export class ProposalRevertService {
  private readonly logger = Logger.getLogger(APP_NAME, ProposalRevertService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Undoes an applied proposal through its stored inverse ops; every artifact must be exactly as the apply left it (postState) or 409 `RFN_006` with nothing touched. */
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

      // The guard is content identity (exists + contentHash), not revision: reverting a newer change bumps it, and a rollback chain must still walk back.
      const postState = (proposal.postState ?? {}) as Record<string, ArtifactState>;
      const refs = Object.keys(postState);
      const current = await loadArtifactStates(tx, projectId, refs);
      const mismatches: BaselineMismatch[] = [];
      for (const ref of refs) {
        const expected = postState[ref] as ArtifactState;
        const actual = current[ref] as ArtifactState;
        const changed = expected.exists !== actual.exists || expected.contentHash !== actual.contentHash;
        if (changed) mismatches.push({ artifactRef: ref, expected, actual });
      }
      if (mismatches.length > 0) return { outcome: 'conflicted' as const, mismatches };

      const ctx: ApplyContext = { tx, projectId, applied: [], staleMarked: [] };
      if (inverseOps.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      for (const op of removalsLast(inverseOps)) await applyContentOp(ctx, op);
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

  /** Undoes one change via its captured inverse; refused (`RFN_015`) while another applied change relies on it, since undoing those would take back unchosen changes. */
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

      const ctx: ApplyContext = { tx, projectId, applied: [], staleMarked: [] };
      const { inverse } = turn.record;
      if (PLAN_STATE_OPS.has(inverse.op)) await lockProjectPlan(tx, projectId);
      await applyContentOp(ctx, inverse);
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

  /** Re-applies an undone change only while its turn stays applied (RFN_017), its dependencies are back (RFN_016) and its records are as the undo left them (RFN_003). */
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

      const ctx: ApplyContext = { tx, projectId, applied: [], staleMarked: [] };
      if (PLAN_STATE_OPS.has(turn.op.op)) await lockProjectPlan(tx, projectId);
      const beforeState = await loadArtifactStates(ctx.tx, projectId, refs);
      const inverse = await captureInverse(ctx, turn.op);
      if (!inverse) throw AppError.internal(`redoing op ${opIndex} captured no inverse, so it could not be undone again`);
      await applyContentOp(ctx, turn.op);
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
    const current = await loadArtifactStates(tx, projectId, refs);
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
   * Reverts each applied proposal newer than `afterProposalId`, newest first, one transaction each, cross-session changes included; skips action-only ones, stops at the first
   * conflict.
   */
  async rollbackAfter(projectId: bigint, afterProposalId: bigint): Promise<RollbackResult> {
    const anchor = await this.db.query.refinementProposals.findFirst({
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, afterProposalId)),
    });
    if (!anchor) throw AppErrorCode.RFN_001.create();
    if (!anchor.appliedAt) throw AppErrorCode.RFN_007.create();

    // appliedAt stays in SQL (a JS Date round-trip shifts timestamps; ties break by id); raw identifiers because drizzle column refs would leak the outer alias into the subquery.
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
