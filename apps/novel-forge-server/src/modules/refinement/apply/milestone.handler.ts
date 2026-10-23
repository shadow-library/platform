import { and, eq } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { assertMilestoneSubject, findMilestoneReferences } from '@server/common';
import { APP_NAME } from '@server/constants';
import { schema } from '@server/database';

import { type ContentOp, type MilestoneRemoveOp, type MilestoneUpsertOp } from '../change-set';
import { type ApplyContext, type ContentOpHandlers } from './apply.types';

const logger = Logger.getLogger(APP_NAME, 'milestone.handler');

// A removed milestone comes back with the chapter that reached it; its planned state is re-derived from the plans.
type MilestoneRestoreOp = MilestoneUpsertOp & { reachedChapter?: number | null; boundRevision?: number | null };

async function inverseMilestone(ctx: ApplyContext, op: MilestoneUpsertOp | MilestoneRemoveOp): Promise<ContentOp | null> {
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

async function applyMilestoneUpsert(ctx: ApplyContext, op: MilestoneRestoreOp): Promise<void> {
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

async function applyMilestoneRemove(ctx: ApplyContext, op: MilestoneRemoveOp): Promise<void> {
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
    logger.warn('applyMilestoneRemove: milestone named as a payoff target by promises that will be left pointing at nothing', {
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

export const MILESTONE_HANDLERS: ContentOpHandlers<'milestone.upsert' | 'milestone.remove'> = {
  'milestone.upsert': { apply: applyMilestoneUpsert, inverse: inverseMilestone },
  'milestone.remove': { apply: applyMilestoneRemove, inverse: inverseMilestone },
};
