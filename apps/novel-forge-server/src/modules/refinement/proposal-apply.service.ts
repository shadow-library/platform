import { and, asc, desc, eq, gt, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { arcContentHash, briefContentHash, computeBibleDocHash, volumeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ActionExecutor, ActionExecutorRegistry } from './action-registry';
import { type ArtifactState, loadArtifactStates } from './artifact-state';
import {
  type ActionOp,
  type ArcRemoveOp,
  type ArcUpsertOp,
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
  isActionOp,
  type PremiseUpdateOp,
  type VolumeRemoveOp,
  type VolumeUpsertOp,
} from './change-set';

export interface AppliedArtifact {
  artifactRef: string;
  newRevision: number | null;
}

export interface OpResult {
  index: number;
  status: 'applied' | 'declined' | 'pending' | 'failed';
  error?: string;
  result?: Record<string, unknown>;
}

export interface ApplyOptions {
  opIndexes?: number[];
  autoApplied?: boolean;
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

interface ApplyContext {
  tx: PrimaryDatabase;
  projectId: bigint;
  applied: AppliedArtifact[];
  staleMarked: string[];
}

type TxResult =
  | { outcome: 'applied'; proposal: Refinement.Proposal; applied: AppliedArtifact[]; staleMarked: string[]; opResults: OpResult[] }
  | { outcome: 'conflicted'; proposal: Refinement.Proposal };

const STALE_VOLUME_CHANGED = 'volume_changed';
const STALE_RANGE_SHIFTED = 'volume_range_shifted';
const STALE_ARC_CHANGED = 'arc_changed';

// Fields whose change invalidates the artifacts planned beneath the volume (§6.2 step 5).
const VOLUME_STRUCTURAL_FIELDS = ['objective', 'conflict', 'payoff', 'targetChapterCount'] as const;

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
   * Applies a pending proposal (§6.2, chat-hub design §5): lock, per-op selection (cherry-pick),
   * baseline conflict check over the selected refs, guarded op dispatch with inverse capture,
   * staleness propagation, audit. Content ops are transactional; selected actions execute after
   * commit, sequentially, with their outcomes folded into opResults. A baseline mismatch commits
   * only the `conflicted` status flip and surfaces as HTTP 409; any other failure rolls the whole
   * transaction back and leaves the proposal pending.
   */
  async apply(projectId: bigint, proposalId: bigint, options?: ApplyOptions): Promise<ApplyResult> {
    this.logger.debug('apply: starting', { projectId, proposalId, opIndexes: options?.opIndexes, autoApplied: options?.autoApplied });
    const result = await this.db.transaction(async (tx): Promise<TxResult> => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw AppErrorCode.RFN_001.create();
      if (proposal.status !== 'pending') throw AppErrorCode.RFN_002.create();

      const ops = proposal.changeSet as ChangeOp[];
      const selected = this.resolveSelection(ops, options?.opIndexes);
      const selectedOps = selected.map(index => ({ index, op: ops[index] as ChangeOp }));
      const contentOps = selectedOps.filter((s): s is { index: number; op: ContentOp } => !isActionOp(s.op));
      const actionOps = selectedOps.filter((s): s is { index: number; op: ActionOp } => isActionOp(s.op));

      // Finalize crosses the immutability line — once prose locks, the revert guarantee is gone, so an
      // auto-mode turn may never trigger it; the proposal stays pending for a deliberate manual apply.
      if (options?.autoApplied && actionOps.some(a => a.op.op === 'action.finalize')) throw AppErrorCode.RFN_009.create();
      for (const action of actionOps) {
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

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      const inverseOps: ContentOp[] = [];
      for (const { op } of contentOps) {
        const inverse = await this.captureInverse(ctx, op);
        await this.applyOp(ctx, op);
        if (inverse) inverseOps.unshift(inverse);
      }
      const postState = await loadArtifactStates(ctx.tx, projectId, changeSetRefs(contentOps.map(c => c.op)));

      const opResults: OpResult[] = ops.map((op, index) => {
        if (!selected.includes(index)) return { index, status: 'declined' };
        return { index, status: isActionOp(op) ? 'pending' : 'applied' };
      });

      const [applied] = await tx
        .update(schema.refinementProposals)
        .set({
          status: 'applied',
          autoApplied: options?.autoApplied ?? false,
          opResults,
          inverseOps,
          postState,
          appliedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!applied) throw AppErrorCode.RFN_001.create();

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
    });

    if (result.outcome === 'conflicted') throw AppErrorCode.RFN_003.create();

    const ops = result.proposal.changeSet as ChangeOp[];
    const pendingActions = result.opResults.filter(r => r.status === 'pending').map(r => ({ index: r.index, op: ops[r.index] as ActionOp }));
    const { opResults, proposal } = await this.executeActions(projectId, result.proposal, result.opResults, pendingActions, options?.autoApplied ?? false);

    this.logger.info(`proposal ${proposalId} applied: ${result.applied.map(a => a.artifactRef).join(', ') || 'actions only'}`);
    return { proposal, applied: result.applied, staleMarked: result.staleMarked, opResults };
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
   * error and stops the rest; already-applied content stays applied (chat-hub design §5.3).
   */
  private async executeActions(
    projectId: bigint,
    proposal: Refinement.Proposal,
    opResults: OpResult[],
    actions: { index: number; op: ActionOp }[],
    autoApplied: boolean,
  ): Promise<{ proposal: Refinement.Proposal; opResults: OpResult[] }> {
    if (actions.length === 0) return { proposal, opResults };

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
        const outcome = await executor(projectId, op, { autoApplied });
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
   * immediately before the op executes, inside the same transaction (chat-hub design §5.2). Upserts
   * over existing rows invert to upserts of the prior refinable fields; creations invert to removes;
   * removes invert to upserts of the deleted content.
   */
  private async captureInverse(ctx: ApplyContext, op: ContentOp): Promise<ContentOp | null> {
    switch (op.op) {
      case 'premise.update': {
        const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
        if (!project) return null;
        const inverse: PremiseUpdateOp = { op: 'premise.update' };
        if (op.premise !== undefined) inverse.premise = project.premise ?? '';
        if (op.brief !== undefined) inverse.brief = project.brief ?? '';
        if (op.themes !== undefined) inverse.themes = (project.themes as string[] | null) ?? [];
        if (op.instructions !== undefined) inverse.instructions = project.instructions ?? '';
        return inverse;
      }
      case 'bible_document.upsert':
      case 'bible_document.remove': {
        const doc = await ctx.tx.query.bibleDocuments.findFirst({
          where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)),
        });
        if (!doc) return op.op === 'bible_document.upsert' ? { op: 'bible_document.remove', section: op.section, slug: op.slug } : null;
        return {
          op: 'bible_document.upsert',
          section: op.section,
          slug: op.slug,
          frontmatter: (doc.frontmatter as Record<string, unknown> | null) ?? undefined,
          body: doc.body ?? undefined,
        };
      }
      case 'volume.upsert':
      case 'volume.remove': {
        const volume = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
        if (!volume) return op.op === 'volume.upsert' ? { op: 'volume.remove', volumeKey: op.volumeKey } : null;
        return {
          op: 'volume.upsert',
          volumeKey: op.volumeKey,
          ordinal: volume.ordinal,
          title: volume.title ?? undefined,
          objective: volume.objective ?? undefined,
          conflict: volume.conflict ?? undefined,
          payoff: volume.payoff ?? undefined,
          targetChapterCount: volume.targetChapterCount ?? undefined,
          cast: (volume.cast as string[] | null) ?? undefined,
          body: volume.body ?? undefined,
        };
      }
      case 'arc.upsert':
      case 'arc.remove': {
        const arc = await ctx.tx.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, ctx.projectId), eq(schema.arcs.arcKey, op.arcKey)) });
        if (!arc) return op.op === 'arc.upsert' ? { op: 'arc.remove', arcKey: op.arcKey } : null;
        return {
          op: 'arc.upsert',
          arcKey: op.arcKey,
          volumeKey: arc.volumeKey,
          ordinal: arc.ordinal,
          title: arc.title ?? undefined,
          objective: arc.objective ?? undefined,
          escalation: arc.escalation ?? undefined,
          payoff: arc.payoff ?? undefined,
          hook: arc.hook ?? undefined,
          chapterStart: arc.chapterStart ?? undefined,
          chapterEnd: arc.chapterEnd ?? undefined,
          cast: (arc.cast as string[] | null) ?? undefined,
          body: arc.body ?? undefined,
        };
      }
      case 'brief.update':
      case 'brief.remove': {
        const brief = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });
        if (!brief) return op.op === 'brief.update' ? { op: 'brief.remove', chapter: op.chapter } : null;
        return {
          op: 'brief.update',
          chapter: op.chapter,
          title: brief.title ?? undefined,
          body: brief.body,
          volumeKey: brief.volumeKey ?? undefined,
          arcKey: brief.arcKey ?? undefined,
          contextRefs: (brief.contextRefs as string[] | null) ?? undefined,
          endingContract: (brief.endingContract as BriefUpdateOp['endingContract'] | null) ?? undefined,
        };
      }
      case 'draft.update':
      case 'draft.remove': {
        const draft = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
        if (!draft) return op.op === 'draft.update' ? { op: 'draft.remove', chapter: op.chapter } : null;
        return { op: 'draft.update', chapter: op.chapter, title: draft.title ?? undefined, body: draft.body, summary: draft.summary ?? undefined };
      }
      case 'entity.upsert':
      case 'entity.remove': {
        const entity = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
        if (!entity) return op.op === 'entity.upsert' ? { op: 'entity.remove', entityKey: op.entityKey } : null;
        return {
          op: 'entity.upsert',
          entityKey: op.entityKey,
          type: entity.type as EntityUpsertOp['type'],
          name: entity.name,
          status: entity.status ?? undefined,
          motivation: entity.motivation ?? undefined,
          notes: entity.notes ?? undefined,
          body: entity.body ?? undefined,
        };
      }
    }
  }

  private applyOp(ctx: ApplyContext, op: ChangeOp): Promise<void> {
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
      case 'arc.upsert':
        return this.applyArcUpsert(ctx, op);
      case 'arc.remove':
        return this.applyArcRemove(ctx, op);
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
      default:
        // Actions never reach the content dispatcher — they are filtered out before apply and executed
        // post-commit (chat-hub design §5.3). Reaching here is a programming error, not bad input.
        throw AppErrorCode.RFN_004.create();
    }
  }

  private async applyPremiseUpdate(ctx: ApplyContext, op: PremiseUpdateOp): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (op.premise !== undefined) update['premise'] = op.premise;
    if (op.brief !== undefined) update['brief'] = op.brief;
    if (op.themes !== undefined) update['themes'] = op.themes;
    if (op.instructions !== undefined) update['instructions'] = op.instructions;

    await ctx.tx.update(schema.projects).set(update).where(eq(schema.projects.id, ctx.projectId));
    ctx.applied.push({ artifactRef: 'premise', newRevision: null });
  }

  private async applyBibleDocUpsert(ctx: ApplyContext, op: BibleDocumentUpsertOp): Promise<void> {
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

  private async applyVolumeUpsert(ctx: ApplyContext, op: VolumeUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });

    const merged = {
      ordinal: op.ordinal ?? existing?.ordinal ?? 0,
      title: op.title ?? existing?.title ?? null,
      objective: op.objective ?? existing?.objective ?? null,
      conflict: op.conflict ?? existing?.conflict ?? null,
      payoff: op.payoff ?? existing?.payoff ?? null,
      targetChapterCount: op.targetChapterCount ?? existing?.targetChapterCount ?? null,
      cast: op.cast ?? existing?.cast ?? null,
      body: op.body ?? existing?.body ?? null,
    };
    const contentHash = volumeContentHash({ volumeKey: op.volumeKey, ...merged, startChapter: existing?.startChapter ?? null, endChapter: existing?.endChapter ?? null });

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
    }
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: revision });

    const structuralChange = existing !== undefined && VOLUME_STRUCTURAL_FIELDS.some(field => op[field] !== undefined && op[field] !== existing[field]);
    if (structuralChange) await this.markArcsStale(ctx, [op.volumeKey], STALE_VOLUME_CHANGED);

    const countChanged = op.targetChapterCount !== undefined && op.targetChapterCount !== existing?.targetChapterCount;
    if (countChanged && existing?.status === 'approved') {
      const shifted = await this.recomputeVolumeRanges(ctx);
      await this.markArcsStale(
        ctx,
        shifted.filter(key => key !== op.volumeKey),
        STALE_RANGE_SHIFTED,
      );
    }
  }

  /**
   * Recomputes approved-plan volume ranges as cumulative `targetChapterCount` sums in ordinal order
   * (§2.1). Volumes missing a count stop the walk — their ranges are settled at the next approve.
   * Returns the volumeKeys whose range actually moved.
   */
  private async recomputeVolumeRanges(ctx: ApplyContext): Promise<string[]> {
    const volumes = await ctx.tx.query.volumes.findMany({ where: eq(schema.volumes.projectId, ctx.projectId), orderBy: asc(schema.volumes.ordinal) });

    const shifted: string[] = [];
    let nextStart = 1;
    for (const volume of volumes) {
      if (volume.targetChapterCount === null) break;
      const startChapter = nextStart;
      const endChapter = nextStart + volume.targetChapterCount - 1;
      nextStart = endChapter + 1;
      if (volume.startChapter === startChapter && volume.endChapter === endChapter) continue;

      const contentHash = volumeContentHash({ ...volume, startChapter, endChapter } as Record<string, unknown>);
      await ctx.tx
        .update(schema.volumes)
        .set({ startChapter, endChapter, revision: volume.revision + 1, contentHash, updatedAt: new Date() })
        .where(eq(schema.volumes.id, volume.id));
      shifted.push(volume.volumeKey);
    }
    return shifted;
  }

  private async markArcsStale(ctx: ApplyContext, volumeKeys: string[], reason: string): Promise<void> {
    if (volumeKeys.length === 0) return;
    const stale = await ctx.tx
      .update(schema.arcs)
      .set({ staleReason: reason, updatedAt: new Date() })
      .where(and(eq(schema.arcs.projectId, ctx.projectId), inArray(schema.arcs.volumeKey, volumeKeys)))
      .returning();
    ctx.staleMarked.push(...stale.map(arc => `arc:${arc.arcKey}`));
  }

  private async applyArcUpsert(ctx: ApplyContext, op: ArcUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, ctx.projectId), eq(schema.arcs.arcKey, op.arcKey)) });

    const merged = {
      volumeKey: op.volumeKey,
      ordinal: op.ordinal ?? existing?.ordinal ?? 0,
      title: op.title ?? existing?.title ?? null,
      objective: op.objective ?? existing?.objective ?? null,
      escalation: op.escalation ?? existing?.escalation ?? null,
      payoff: op.payoff ?? existing?.payoff ?? null,
      hook: op.hook ?? existing?.hook ?? null,
      chapterStart: op.chapterStart ?? existing?.chapterStart ?? null,
      chapterEnd: op.chapterEnd ?? existing?.chapterEnd ?? null,
      cast: op.cast ?? existing?.cast ?? null,
      body: op.body ?? existing?.body ?? null,
    };

    const volume = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!volume) throw AppErrorCode.VOL_001.create();
    const withinVolume =
      volume.startChapter === null ||
      volume.endChapter === null ||
      merged.chapterStart === null ||
      merged.chapterEnd === null ||
      (merged.chapterStart >= volume.startChapter && merged.chapterEnd <= volume.endChapter);
    if (!withinVolume) throw AppErrorCode.ARC_002.create();

    const contentHash = arcContentHash({ arcKey: op.arcKey, ...merged });
    let revision: number;
    if (existing) {
      revision = existing.revision + 1;
      await ctx.tx
        .update(schema.arcs)
        .set({ ...merged, revision, contentHash, updatedAt: new Date() })
        .where(eq(schema.arcs.id, existing.id));
    } else {
      revision = 1;
      await ctx.tx.insert(schema.arcs).values({ projectId: ctx.projectId, arcKey: op.arcKey, ...merged, revision, contentHash });
    }
    ctx.applied.push({ artifactRef: `arc:${op.arcKey}`, newRevision: revision });

    if (existing && merged.chapterStart !== null && merged.chapterEnd !== null) {
      const stale = await ctx.tx
        .update(schema.briefs)
        .set({ staleReason: STALE_ARC_CHANGED, updatedAt: new Date() })
        .where(and(eq(schema.briefs.projectId, ctx.projectId), gte(schema.briefs.chapter, merged.chapterStart), lte(schema.briefs.chapter, merged.chapterEnd)))
        .returning();
      ctx.staleMarked.push(...stale.map(brief => `chapter:${brief.chapter}`));
    }
  }

  private async applyVolumeRemove(ctx: ApplyContext, op: VolumeRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!existing) throw AppErrorCode.VOL_001.create();
    if (existing.status !== 'draft') throw AppErrorCode.RFN_004.create();

    await ctx.tx.delete(schema.volumes).where(eq(schema.volumes.id, existing.id));
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: null });
  }

  private async applyArcRemove(ctx: ApplyContext, op: ArcRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, ctx.projectId), eq(schema.arcs.arcKey, op.arcKey)) });
    if (!existing) throw AppErrorCode.ARC_001.create();
    if (existing.status !== 'draft') throw AppErrorCode.RFN_004.create();

    await ctx.tx.delete(schema.arcs).where(eq(schema.arcs.id, existing.id));
    ctx.applied.push({ artifactRef: `arc:${op.arcKey}`, newRevision: null });
  }

  private async applyBriefUpdate(ctx: ApplyContext, op: BriefUpdateOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_005.create();

    const existing = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });

    // A missing brief is creatable — refinement is a first-class authoring path — but only with a body;
    // without one there is nothing for the chapter author to draft from.
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const merged = {
      title: op.title ?? existing?.title ?? null,
      body: op.body ?? existing?.body ?? '',
      volumeKey: op.volumeKey ?? existing?.volumeKey ?? null,
      arcKey: op.arcKey ?? existing?.arcKey ?? null,
      contextRefs: op.contextRefs ?? existing?.contextRefs ?? null,
      endingContract: op.endingContract ?? existing?.endingContract ?? null,
      // Not editable via ops — carried through so the hash (which includes it) matches the row.
      knowledgeContract: existing?.knowledgeContract ?? null,
    };
    const contentHash = briefContentHash({ chapter: op.chapter, ...merged });
    const revision = (existing?.revision ?? 0) + 1;

    if (existing) {
      await ctx.tx
        .update(schema.briefs)
        .set({ ...merged, revision, contentHash, staleReason: null, updatedAt: new Date() })
        .where(eq(schema.briefs.id, existing.id));
    } else {
      await ctx.tx.insert(schema.briefs).values({ projectId: ctx.projectId, chapter: op.chapter, ...merged, revision, contentHash });
    }
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: revision });
  }

  private async applyBriefRemove(ctx: ApplyContext, op: BriefRemoveOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_005.create();

    const deleted = await ctx.tx
      .delete(schema.briefs)
      .where(and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: null });
  }

  /**
   * Draft prose is chat-editable only while it is still a draft (chat-hub design decision 2): a final
   * draft or a chapter at/behind the story cursor is locked canon. Every edit lands as a
   * draft_revisions row (source chat_edited), so prose history survives independent of proposal revert.
   */
  private async applyDraftUpdate(ctx: ApplyContext, op: DraftUpdateOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_010.create();

    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.RFN_010.create();
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const merged = { title: op.title ?? existing?.title ?? null, body: op.body ?? existing?.body ?? '', summary: op.summary ?? existing?.summary ?? null };
    const revision = (existing?.revision ?? 0) + 1;

    let draftId: bigint;
    if (existing) {
      await ctx.tx
        .update(schema.drafts)
        .set({ ...merged, revision, reviewStatus: 'needs_review', updatedAt: new Date() })
        .where(eq(schema.drafts.id, existing.id));
      draftId = existing.id;
    } else {
      const [created] = await ctx.tx
        .insert(schema.drafts)
        .values({ projectId: ctx.projectId, chapter: op.chapter, ...merged, status: 'draft', revision, reviewStatus: 'needs_review', generator: 'standard' })
        .returning();
      if (!created) throw AppErrorCode.DRF_001.create();
      draftId = created.id;
    }

    await ctx.tx
      .insert(schema.draftRevisions)
      .values({ projectId: ctx.projectId, draftId, revision, source: 'chat_edited', body: merged.body, summary: merged.summary })
      .onConflictDoNothing();
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: revision });
  }

  private async applyDraftRemove(ctx: ApplyContext, op: DraftRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (!existing) throw AppErrorCode.DRF_001.create();
    if (existing.status === 'final') throw AppErrorCode.RFN_010.create();

    await ctx.tx.delete(schema.drafts).where(eq(schema.drafts.id, existing.id));
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: null });
  }

  private async applyEntityUpsert(ctx: ApplyContext, op: EntityUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!existing && !op.name) throw AppErrorCode.RFN_004.create();

    const merged = {
      type: op.type,
      name: op.name ?? existing?.name ?? op.entityKey,
      status: op.status ?? existing?.status ?? null,
      motivation: op.motivation ?? existing?.motivation ?? null,
      notes: op.notes ?? existing?.notes ?? null,
      body: op.body ?? existing?.body ?? null,
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

  /**
   * Undoes an applied proposal by executing its stored inverse ops through the same appliers —
   * same hashing, revision bumps, and staleness propagation as any apply (hard rule 14). Guarded
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
      if (proposal.status !== 'applied' || inverseOps.length === 0) throw AppErrorCode.RFN_007.create();

      // Content identity (exists + contentHash) is the guard — NOT revision: reverting a newer change
      // on the same artifact restores this proposal's content but bumps the revision counter, and a
      // rollback chain must keep walking backward through exactly that state (chat-hub design §5.5).
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
      for (const op of inverseOps) await this.applyOp(ctx, op);

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
   * Rolls the project back to the state right after `afterProposalId` was applied: every applied
   * proposal newer than the anchor is reverted, newest first, each in its own transaction. Action-only
   * proposals (nothing to invert) are skipped. Stops at the first conflict and reports how far it got
   * (chat-hub design §5.5). Cross-session changes are included by design — the history is project-wide.
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
      if (inverseOps.length === 0) {
        result.skipped.push(proposal.id);
        continue;
      }
      try {
        const reverted = await this.revert(projectId, proposal.id);
        result.reverted.push({ proposalId: proposal.id, artifacts: reverted.reverted });
      } catch (err) {
        result.stoppedAt = proposal.id;
        if (AppError.is(err)) result.conflict = { code: err.code, message: err.message };
        else result.conflict = { message: err instanceof Error ? err.message : String(err) };
        break;
      }
    }
    return result;
  }
}
