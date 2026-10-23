import { and, eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { briefContentHash, nearestVolumeKey, planFrontier, resetApprovalForPlanChange } from '@server/common';
import { schema } from '@server/database';

import { defaultChapterMode } from '../../ai/chapter-route';
import { type BriefRestoreFields, mergeBriefUpdate } from '../brief-merge';
import { type BriefRemoveOp, type BriefUpdateOp, type ContentOp } from '../change-set';
import { type ApplyContext, type ContentOpHandlers } from './apply.types';

// Captured on the inverse and restored on revert, but deliberately absent from `OP_SPECS`: whether a human wrote the brief
// is the engine's to record, never a field a model or author change-set can set.
type BriefRestoreOp = BriefRestoreFields & { handEdited?: boolean };

async function inverseBrief(ctx: ApplyContext, op: BriefUpdateOp | BriefRemoveOp): Promise<ContentOp | null> {
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

/** A plan at or behind the story cursor or the latest finalized chapter is part of canon's history. */
async function assertPlanOpen(ctx: ApplyContext, chapter: number): Promise<void> {
  const project = await ctx.tx.query.projects.findFirst({ columns: { id: true }, where: eq(schema.projects.id, ctx.projectId) });
  if (!project) throw AppErrorCode.PRJ_001.create();
  if (chapter <= (await planFrontier(ctx.tx, ctx.projectId))) throw AppErrorCode.RFN_005.create();
}

async function applyBriefUpdate(ctx: ApplyContext, op: BriefRestoreOp): Promise<void> {
  await assertPlanOpen(ctx, op.chapter);

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

async function applyBriefRemove(ctx: ApplyContext, op: BriefRemoveOp): Promise<void> {
  await assertPlanOpen(ctx, op.chapter);

  const deleted = await ctx.tx
    .delete(schema.briefs)
    .where(and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)))
    .returning();
  if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
  await resetApprovalForPlanChange(ctx.tx, ctx.projectId, op.chapter, deleted[0], {});
  ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: null });
}

export const BRIEF_HANDLERS: ContentOpHandlers<'brief.update' | 'brief.remove'> = {
  'brief.update': { apply: applyBriefUpdate, inverse: inverseBrief },
  'brief.remove': { apply: applyBriefRemove, inverse: inverseBrief },
};
