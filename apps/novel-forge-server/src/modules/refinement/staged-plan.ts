import { and, eq } from 'drizzle-orm';

import { nearestVolumeKey, type PlanOverlay } from '@server/common';
import { type DbExecutor, schema } from '@server/database';

import { mergeBriefUpdate } from './brief-merge';
import { type BriefUpdateOp } from './change-set';

export interface StagedPlan extends PlanOverlay {
  contextRefs: string[] | null;
  pov: string | null;
}

/** The chapter's plan as applying `op` would leave it, merged in memory by the apply's own merge; nothing is written. */
export async function loadStagedPlan(db: Pick<DbExecutor, 'query'>, projectId: bigint, op: BriefUpdateOp): Promise<StagedPlan> {
  const existing = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, op.chapter)) });
  const volumeKey = existing || op.volumeKey !== undefined ? null : await nearestVolumeKey(db, projectId, op.chapter);
  const merged = mergeBriefUpdate(existing, op, { volumeKey, contentMode: null });
  return {
    chapter: op.chapter,
    volumeKey: merged.volumeKey,
    isEnding: merged.isEnding,
    claimedMilestones: merged.claimedMilestones,
    knowledgeContract: merged.knowledgeContract,
    endingContract: merged.endingContract,
    contextRefs: (merged.contextRefs as string[] | null) ?? null,
    pov: merged.pov,
  };
}
