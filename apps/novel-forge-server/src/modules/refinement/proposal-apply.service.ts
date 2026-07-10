/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { arcContentHash, briefContentHash, computeBibleDocHash, volumeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ArtifactState, loadArtifactStates } from './artifact-state';
import {
  type ArcRemoveOp,
  type ArcUpsertOp,
  type BibleDocumentRemoveOp,
  type BibleDocumentUpsertOp,
  type BriefUpdateOp,
  type ChangeOp,
  type EntityRemoveOp,
  type EntityUpsertOp,
  type PremiseUpdateOp,
  type VolumeRemoveOp,
  type VolumeUpsertOp,
  changeSetRefs,
} from './change-set';

/**
 * Defining types
 */

export interface AppliedArtifact {
  artifactRef: string;
  newRevision: number | null;
}

export interface ApplyResult {
  proposal: Refinement.Proposal;
  applied: AppliedArtifact[];
  staleMarked: string[];
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

type TxResult = { outcome: 'applied'; proposal: Refinement.Proposal; applied: AppliedArtifact[]; staleMarked: string[] } | { outcome: 'conflicted'; proposal: Refinement.Proposal };

/**
 * Declaring the constants
 */

const STALE_VOLUME_CHANGED = 'volume_changed';
const STALE_RANGE_SHIFTED = 'volume_range_shifted';
const STALE_ARC_CHANGED = 'arc_changed';

// Fields whose change invalidates the artifacts planned beneath the volume (§6.2 step 5).
const VOLUME_STRUCTURAL_FIELDS = ['objective', 'conflict', 'payoff', 'targetChapterCount'] as const;

@Injectable()
export class ProposalApplyService {
  private readonly logger = Logger.getLogger(APP_NAME, ProposalApplyService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Applies a pending proposal atomically (§6.2): lock, baseline conflict check, guarded op
   * dispatch, staleness propagation, audit. A baseline mismatch commits only the `conflicted`
   * status flip and surfaces as HTTP 409; any other failure rolls the whole transaction back and
   * leaves the proposal pending.
   */
  async apply(projectId: bigint, proposalId: bigint): Promise<ApplyResult> {
    const result = await this.db.transaction(async (tx): Promise<TxResult> => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw new ServerError(AppErrorCode.RFN_001);
      if (proposal.status !== 'pending') throw new ServerError(AppErrorCode.RFN_002);

      const ops = proposal.changeSet as ChangeOp[];
      const baseline = proposal.baseline as Record<string, ArtifactState>;
      const mismatches = await this.findBaselineMismatches(tx as unknown as PrimaryDatabase, projectId, ops, baseline);
      if (mismatches.length > 0) {
        const [conflicted] = await tx
          .update(schema.refinementProposals)
          .set({ status: 'conflicted', error: { mismatches }, updatedAt: new Date() })
          .where(eq(schema.refinementProposals.id, proposal.id))
          .returning();
        return { outcome: 'conflicted', proposal: conflicted ?? proposal };
      }

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      for (const op of ops) await this.applyOp(ctx, op);

      const [applied] = await tx
        .update(schema.refinementProposals)
        .set({ status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!applied) throw new ServerError(AppErrorCode.RFN_001);

      await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposal.id), disposition: 'approved', note: proposal.summary });

      return { outcome: 'applied', proposal: applied, applied: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)] };
    });

    if (result.outcome === 'conflicted') throw new ServerError(AppErrorCode.RFN_003);
    this.logger.info(`proposal ${proposalId} applied: ${result.applied.map(a => a.artifactRef).join(', ')}`);
    return { proposal: result.proposal, applied: result.applied, staleMarked: result.staleMarked };
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
      case 'entity.upsert':
        return this.applyEntityUpsert(ctx, op);
      case 'entity.remove':
        return this.applyEntityRemove(ctx, op);
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
    if (deleted.length === 0) throw new ServerError(AppErrorCode.DOC_001);

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
    if (!volume) throw new ServerError(AppErrorCode.VOL_001);
    const withinVolume =
      volume.startChapter === null ||
      volume.endChapter === null ||
      merged.chapterStart === null ||
      merged.chapterEnd === null ||
      (merged.chapterStart >= volume.startChapter && merged.chapterEnd <= volume.endChapter);
    if (!withinVolume) throw new ServerError(AppErrorCode.ARC_002);

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
    if (!existing) throw new ServerError(AppErrorCode.VOL_001);
    if (existing.status !== 'draft') throw new ServerError(AppErrorCode.RFN_004);

    await ctx.tx.delete(schema.volumes).where(eq(schema.volumes.id, existing.id));
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: null });
  }

  private async applyArcRemove(ctx: ApplyContext, op: ArcRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, ctx.projectId), eq(schema.arcs.arcKey, op.arcKey)) });
    if (!existing) throw new ServerError(AppErrorCode.ARC_001);
    if (existing.status !== 'draft') throw new ServerError(AppErrorCode.RFN_004);

    await ctx.tx.delete(schema.arcs).where(eq(schema.arcs.id, existing.id));
    ctx.applied.push({ artifactRef: `arc:${op.arcKey}`, newRevision: null });
  }

  private async applyBriefUpdate(ctx: ApplyContext, op: BriefUpdateOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw new ServerError(AppErrorCode.RFN_005);

    const existing = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });

    // A missing brief is creatable — refinement is a first-class authoring path — but only with a body;
    // without one there is nothing for the chapter author to draft from.
    if (!existing && op.body === undefined) throw new ServerError(AppErrorCode.RFN_004);

    const merged = {
      title: op.title ?? existing?.title ?? null,
      body: op.body ?? existing?.body ?? '',
      volumeKey: op.volumeKey ?? existing?.volumeKey ?? null,
      arcKey: op.arcKey ?? existing?.arcKey ?? null,
      contextRefs: op.contextRefs ?? existing?.contextRefs ?? null,
      endingContract: op.endingContract ?? existing?.endingContract ?? null,
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

  private async applyEntityUpsert(ctx: ApplyContext, op: EntityUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!existing && !op.name) throw new ServerError(AppErrorCode.RFN_004);

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
    if (deleted.length === 0) throw new ServerError(AppErrorCode.RFN_004);
    ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
  }
}
