import { and, desc, eq } from 'drizzle-orm';

import { type DbExecutor, schema } from '@server/database';

import { nearestVolumeKey } from './brief-volume';
import { type PlanRow, planUnlockContext, planUnlockContexts, type PlanWorld, type RevealFact } from './reveal-rule';
import { type UnlockContext } from './unlock-condition';

type PlanReader = Pick<DbExecutor, 'query'>;

export interface PlanState extends PlanWorld {
  plans: (PlanRow & { id: bigint; staleReason: string | null })[];
  facts: (RevealFact & { id: bigint; plannedChapter: number | null })[];
  milestoneRows: { id: bigint; milestoneKey: string; state: string; plannedChapter: number | null }[];
  /** The last chapter whose plan can no longer change: the story cursor or the latest finalized chapter, whichever is later. */
  frontier: number;
}

/** Serialises plan writes per project on the row chapter insert also locks first, so rule checks and derived state never race. */
export async function lockProjectPlan(tx: DbExecutor, projectId: bigint): Promise<void> {
  await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).for('update');
}

export async function planFrontier(db: PlanReader, projectId: bigint): Promise<number> {
  const [project, latestFinal] = await Promise.all([
    db.query.projects.findFirst({ columns: { storyCurrentChapter: true }, where: eq(schema.projects.id, projectId) }),
    db.query.chapters.findFirst({
      columns: { number: true },
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
      orderBy: desc(schema.chapters.number),
    }),
  ]);
  return Math.max(project?.storyCurrentChapter ?? 0, latestFinal?.number ?? 0);
}

export async function loadPlanState(db: PlanReader, projectId: bigint): Promise<PlanState> {
  const [briefs, milestones, volumes, facts, frontier] = await Promise.all([
    db.query.briefs.findMany({
      columns: { id: true, chapter: true, volumeKey: true, isEnding: true, claimedMilestones: true, knowledgeContract: true, staleReason: true },
      where: eq(schema.briefs.projectId, projectId),
    }),
    db.query.milestones.findMany({ where: eq(schema.milestones.projectId, projectId) }),
    db.query.volumes.findMany({ columns: { volumeKey: true, ordinal: true }, where: eq(schema.volumes.projectId, projectId) }),
    db.query.canonFacts.findMany({
      columns: { id: true, factKey: true, revealChapter: true, unlock: true, source: true, plannedChapter: true },
      where: eq(schema.canonFacts.projectId, projectId),
    }),
    planFrontier(db, projectId),
  ]);
  const byId = <T extends { id: bigint }>(left: T, right: T): number => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return {
    plans: briefs.sort(byId),
    milestones,
    milestoneRows: [...milestones].sort(byId),
    volumeOrdinals: new Map(volumes.map(volume => [volume.volumeKey, volume.ordinal])),
    facts: facts.sort(byId),
    frontier,
  };
}

function bareContext(chapter: number): UnlockContext {
  return { chapter, endingChapter: null, volumeKey: null, volumeOrdinals: new Map(), reachedMilestones: new Set() };
}

/** Each planned chapter's view for the reveal rule, loaded once; only a condition reads the plans, so without one nothing is loaded. */
export async function plannedUnlockContexts(db: PlanReader, projectId: bigint, conditioned: boolean): Promise<(chapter: number) => UnlockContext> {
  if (!conditioned) return bareContext;
  const state = await loadPlanState(db, projectId);
  const contexts = planUnlockContexts(state);
  return chapter => {
    const plan = state.plans.find(candidate => candidate.chapter === chapter);
    return (plan && contexts.get(plan)) ?? planUnlockContext({ chapter, volumeKey: null, isEnding: false, claimedMilestones: [] }, state);
  };
}

/**
 * The reveal rule's view of `chapter`: its own plan's claims, volume and ending, or a bare plan when it has none yet. Only a condition
 * reads the plans, so without one (`conditioned` false) nothing is loaded.
 */
export async function chapterUnlockContext(db: PlanReader, projectId: bigint, chapter: number, conditioned: boolean): Promise<UnlockContext> {
  if (!conditioned) return bareContext(chapter);
  const state = await loadPlanState(db, projectId);
  const plan = state.plans.find(candidate => candidate.chapter === chapter) ?? {
    chapter,
    volumeKey: await nearestVolumeKey(db, projectId, chapter),
    isEnding: false,
    claimedMilestones: [],
  };
  return planUnlockContext(plan, state);
}
