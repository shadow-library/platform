import { composePlanBody, normalizeBriefScenes, normalizeStringList } from '@server/common';
import { type Generation, type Project } from '@server/database';

import { type BriefUpdateOp } from './change-set';

export interface BriefMergeDefaults {
  /** The volume a brief the op creates joins when the op names none: the nearest planned chapter's. Read only in that case. */
  volumeKey: string | null;
  /** The content mode a brief the op creates starts in when the op names none: the project's. Read only in that case. */
  contentMode: Project.ContentMode | null;
}

type MergedBrief = Pick<
  Generation.Brief,
  | 'title'
  | 'body'
  | 'writeMode'
  | 'volumeKey'
  | 'contextRefs'
  | 'pov'
  | 'chapterPurpose'
  | 'readerValue'
  | 'repetitionRisks'
  | 'densityRisk'
  | 'endingContract'
  | 'knowledgeContract'
  | 'direction'
  | 'contentMode'
  | 'scenes'
  | 'claimedMilestones'
  | 'isEnding'
>;

/** The brief as applying `op` leaves it. Pure: the apply writes it, and a plan card's preview judges it without writing. */
export function mergeBriefUpdate(existing: MergedBrief | undefined, op: BriefUpdateOp, defaults: BriefMergeDefaults): MergedBrief {
  const merged: MergedBrief = {
    title: op.title ?? existing?.title ?? null,
    body: op.body ?? existing?.body ?? '',
    writeMode: op.writeMode ?? existing?.writeMode ?? 'standard',
    volumeKey: op.volumeKey !== undefined ? op.volumeKey : existing ? existing.volumeKey : defaults.volumeKey,
    contextRefs: op.contextRefs ?? existing?.contextRefs ?? null,
    pov: op.pov !== undefined ? op.pov?.trim() || null : (existing?.pov ?? null),
    chapterPurpose: op.chapterPurpose ?? existing?.chapterPurpose ?? null,
    readerValue: op.readerValue ?? existing?.readerValue ?? null,
    repetitionRisks: op.repetitionRisks !== undefined ? op.repetitionRisks : (existing?.repetitionRisks ?? null),
    densityRisk: op.densityRisk !== undefined ? op.densityRisk?.trim() || null : (existing?.densityRisk ?? null),
    endingContract: op.endingContract ?? existing?.endingContract ?? null,
    knowledgeContract: op.knowledgeContract !== undefined ? op.knowledgeContract : (existing?.knowledgeContract ?? null),
    direction: op.direction !== undefined ? op.direction?.trim() || null : (existing?.direction ?? null),
    contentMode: op.contentMode !== undefined ? op.contentMode : existing ? existing.contentMode : defaults.contentMode,
    scenes: op.scenes !== undefined ? op.scenes && normalizeBriefScenes(op.scenes) : (existing?.scenes ?? null),
    claimedMilestones: op.claimedMilestones !== undefined ? op.claimedMilestones && normalizeStringList(op.claimedMilestones) : (existing?.claimedMilestones ?? null),
    isEnding: op.isEnding ?? existing?.isEnding ?? false,
  };
  if (op.scenes !== undefined) merged.body = composePlanBody(merged.body, merged.scenes ?? []);
  return merged;
}
