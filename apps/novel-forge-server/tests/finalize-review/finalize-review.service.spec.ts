import { describe, expect, it } from 'bun:test';

import { commitFinalProse } from '@modules/ai/graphs/chapter-finalization.graph';
import { WALLED_OFF_EXCERPT } from '@modules/ai/isolation-read-policy';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { FinalizeReviewService, RECENTLY_APPLIED_MS } from '@modules/finalize-review/finalize-review.service';
import { hashReviewedBody } from '@modules/review/review-findings';
import { schema } from '@server/database';

import { planTables } from '../knowledge/plan-tables';

const PROSE = 'Mira climbs the tower and the lamp burns cold.';

const EXTRACTION: ContinuityOutput = {
  appeared: ['mira'],
  newEntities: [],
  threads: [{ threadKey: 'lamp_debt', status: 'closed', summary: 'Mira repays the keeper' }],
  mysteries: [],
  timeline: [],
  relationships: [],
  power: [],
  characterStates: [{ entityKey: 'mira', location: 'the tower', evidence: 'Mira climbs the tower' }],
  knowledgeChanges: [],
  chapterSummary: 'Mira climbs.',
  milestones: [],
};

const CONFIDENT: ContinuityOutput = { ...EXTRACTION, threads: [] };

interface FinalizeCalls {
  ready: boolean;
  finalized: number[];
  failWith?: Error;
  runStatus?: 'completed' | 'failed';
}

/** Stands in for GenerationService: readiness answers from `ready`, and finalize records the chapter it was asked to commit. */
function fakeGeneration(calls: FinalizeCalls) {
  return {
    finalizeReadiness: async () => ({ ready: calls.ready, blockers: calls.ready ? [] : [{ code: 'FIN_001', message: 'Finalize chapters in order' }] }),
    finalize: async (_projectId: bigint, body: { chapter: number }) => {
      if (calls.failWith) throw calls.failWith;
      calls.finalized.push(body.chapter);
      return { runId: 'run-1', status: calls.runStatus ?? 'completed', outcome: calls.runStatus ?? 'completed' };
    },
  };
}

function setup(extraction: ContinuityOutput = EXTRACTION) {
  const tables = planTables({
    entities: [{ entityKey: 'mira', name: 'Mira' }],
    briefs: [{ chapter: 5 }],
    drafts: [{ id: 55n, chapter: 5, revision: 3, body: PROSE, reviewStatus: 'approved', approvedRevision: 3 }],
    storyCurrentChapter: 4,
  });
  tables.rows(schema.finalizeReviews).push({
    id: 500n,
    projectId: 7n,
    chapter: 5,
    draftId: 55n,
    draftRevision: 3,
    sourceHash: hashReviewedBody(PROSE),
    planHash: null,
    isolated: false,
    bridgeOnly: false,
    status: 'preparing',
    error: null,
    applied: null,
    appliedAt: null,
    revertedAt: null,
  });
  const modelRouter: { structured: () => Promise<ContinuityOutput> } = { structured: async () => extraction };
  const calls: FinalizeCalls = { ready: true, finalized: [] };
  const service = new FinalizeReviewService(
    { getPostgresClient: () => tables.db } as never,
    modelRouter as never,
    { register: () => undefined } as never,
    fakeGeneration(calls) as never,
  );
  const prepare = () => service.runJob({ payload: { reviewId: '500' } } as never);
  const review = () => tables.rows(schema.finalizeReviews)[0] as Record<string, unknown>;
  return { tables, service, prepare, review, modelRouter, calls };
}

describe('FinalizeReviewService', () => {
  it('should read the approved revision into consequential and routine items and mark the review ready', async () => {
    const { service, prepare } = setup();
    await prepare();

    const view = await service.get(7n, 5);

    expect(view.status).toBe('ready');
    expect(view.current).toBe(true);
    expect(view.consequential.map(item => item.category)).toEqual(['promise']);
    expect(view.routine.map(item => item.category)).toEqual(['appearance', 'character_state']);
    expect(view.disclosure.copy).toBe('No unplanned disclosure detected · revision 3');
  });

  it("should keep routine items of the author's auto-keep categories without asking", async () => {
    const { tables, service, prepare } = setup();
    const project = await tables.db.query.projects.findFirst();
    Object.assign(project, { config: { finalizeReview: { autoKeep: ['appearance'] } } });
    await prepare();

    const view = await service.get(7n, 5);

    expect(view.routine.map(item => [item.category, item.decision, item.autoKept])).toEqual([
      ['appearance', 'kept', true],
      ['character_state', null, false],
    ]);
    expect(view.open).toEqual({ consequential: 1, routine: 1 });
  });

  it('should persist an inline edit as the value finalize applies', async () => {
    const { service, prepare } = setup();
    await prepare();
    const state = (await service.get(7n, 5)).routine.find(item => item.category === 'character_state');

    const view = await service.decide(7n, 5, state?.id as bigint, { decision: 'edited', edited: { location: 'the lighthouse' } });

    const edited = view.routine.find(item => item.id === state?.id);
    expect(edited).toMatchObject({ decision: 'edited', edited: { category: 'character_state', state: { entityKey: 'mira', location: 'the lighthouse' } } });
  });

  it('should never ask a skipped item again, even when the revision is read again', async () => {
    const { service, prepare, review } = setup();
    await prepare();
    const payoff = (await service.get(7n, 5)).consequential[0];
    await service.decide(7n, 5, payoff?.id as bigint, { decision: 'skipped', reason: 'the debt is only half paid' });

    review()['status'] = 'preparing';
    await prepare();

    const view = await service.get(7n, 5);
    expect(view.consequential[0]).toMatchObject({ decision: 'skipped', reason: 'the debt is only half paid' });
    expect(view.open.consequential).toBe(0);
  });

  it("should carry a skip into the next revision's review even when the re-read words the update differently", async () => {
    const { tables, service, prepare, modelRouter } = setup();
    await prepare();
    const payoff = (await service.get(7n, 5)).consequential[0];
    await service.decide(7n, 5, payoff?.id as bigint, { decision: 'skipped', reason: 'not paid yet' });

    const edited = `${PROSE} She pauses.`;
    Object.assign(tables.draft(5) as object, { revision: 4, body: edited });
    tables.rows(schema.finalizeReviews).push({ ...tables.rows(schema.finalizeReviews)[0], id: 501n, draftRevision: 4, sourceHash: hashReviewedBody(edited), status: 'preparing' });
    modelRouter.structured = async () => ({ ...EXTRACTION, threads: [{ threadKey: 'lamp_debt', status: 'closed', summary: 'The keeper is repaid at last' }] });
    await service.runJob({ payload: { reviewId: '501' } } as never);

    const view = await service.get(7n, 5);
    expect(view.draftRevision).toBe(4);
    expect(view.consequential[0]).toMatchObject({ claim: 'Paid off: The keeper is repaid at last', decision: 'skipped', reason: 'not paid yet' });
  });

  it('should refuse a skip without a reason and any decision once the prose moved past the review', async () => {
    const { tables, service, prepare } = setup();
    await prepare();
    const payoff = (await service.get(7n, 5)).consequential[0];

    await expect(service.decide(7n, 5, payoff?.id as bigint, { decision: 'skipped' })).rejects.toMatchObject({ code: 'FRV_010' });
    Object.assign(tables.draft(5) as object, { revision: 4, body: `${PROSE} Edited.` });
    await expect(service.decide(7n, 5, payoff?.id as bigint, { decision: 'kept' })).rejects.toMatchObject({ code: 'FRV_004' });
    expect((await service.get(7n, 5)).current).toBe(false);
  });

  it("should withhold an isolated chapter's evidence from the review it reads", async () => {
    const { tables, service, prepare } = setup();
    await prepare();
    Object.assign(tables.draft(5) as object, { isolated: true });

    const state = (await service.get(7n, 5)).routine.find(item => item.category === 'character_state');

    expect(state?.evidence).toBe(WALLED_OFF_EXCERPT);
    expect(state?.proposed).toMatchObject({ state: { evidence: WALLED_OFF_EXCERPT } });
  });
});

describe('FinalizeReviewService — approval adds the confident updates', () => {
  it('should keep every routine item without asking while the author has not chosen categories', async () => {
    const { service, prepare } = setup();
    await prepare();

    const view = await service.get(7n, 5);

    expect(view.routine.map(item => [item.category, item.decision, item.autoKept])).toEqual([
      ['appearance', 'kept', true],
      ['character_state', 'kept', true],
    ]);
    expect(view.autoKeep).toEqual(['appearance', 'character_state', 'relationship', 'promise', 'entity', 'milestone']);
  });

  it('should finalize the chapter once approval left nothing to ask', async () => {
    const { prepare, calls, review } = setup(CONFIDENT);

    await prepare();

    expect(calls.finalized).toEqual([5]);
    expect(review()['status']).toBe('ready');
  });

  it('should leave the chapter for the author while an unsure update waits on them', async () => {
    const { service, prepare, calls } = setup();

    await prepare();

    expect(calls.finalized).toEqual([]);
    expect((await service.get(7n, 5)).open).toEqual({ consequential: 1, routine: 0 });
  });

  it('should leave an answered review waiting when finalize would refuse the chapter', async () => {
    const { service, prepare, calls } = setup(CONFIDENT);
    calls.ready = false;

    await prepare();

    expect(calls.finalized).toEqual([]);
    expect((await service.get(7n, 5)).status).toBe('ready');
  });

  it('should keep the prepared review when the automatic finalize fails', async () => {
    const { service, prepare, calls } = setup(CONFIDENT);
    calls.failWith = new Error('the claim is held');

    await prepare();

    expect((await service.get(7n, 5)).status).toBe('ready');
  });

  it('should report a finalize run that failed as not finalized, never as finalized on approval', async () => {
    const { service, prepare, calls } = setup(CONFIDENT);
    calls.runStatus = 'failed';
    const logged: string[] = [];
    const logger = (service as unknown as { logger: Record<string, (message: string) => void> }).logger;
    for (const level of ['info', 'warn'] as const) logger[level] = (message: string) => void logged.push(`${level}: ${message}`);

    await prepare();

    expect(logged).toContain('warn: chapter not finalized on approval');
    expect(logged).not.toContain('info: chapter finalized on approval');
  });

  it('should log a completed finalize run as finalized on approval', async () => {
    const { service, prepare } = setup(CONFIDENT);
    const logged: string[] = [];
    const logger = (service as unknown as { logger: Record<string, (message: string) => void> }).logger;
    for (const level of ['info', 'warn'] as const) logger[level] = (message: string) => void logged.push(`${level}: ${message}`);

    await prepare();

    expect(logged).toContain('info: chapter finalized on approval');
  });

  it('should never finalize an isolated chapter on its own, even when its review asks nothing', async () => {
    const { service, prepare, calls, review } = setup({ ...CONFIDENT, appeared: [], characterStates: [], chapterSummary: '' });
    review()['isolated'] = true;

    await prepare();

    expect((await service.get(7n, 5)).open).toEqual({ consequential: 0, routine: 0 });
    expect(calls.finalized).toEqual([]);
  });

  it('should ask the routine categories the author turned off, and finalize nothing until they answer', async () => {
    const { tables, service, prepare, calls } = setup(CONFIDENT);
    Object.assign(await tables.db.query.projects.findFirst(), { config: { finalizeReview: { autoKeep: [] } } });

    await prepare();

    expect(calls.finalized).toEqual([]);
    expect((await service.get(7n, 5)).open).toEqual({ consequential: 0, routine: 2 });
  });
});

describe('FinalizeReviewService.list', () => {
  function appliedChapter(tables: ReturnType<typeof setup>['tables'], chapter: number, appliedAt: Date): void {
    const body = `Chapter ${chapter}.`;
    tables.rows(schema.drafts).push({ id: BigInt(chapter * 11), projectId: 7n, chapter, revision: 1, body, status: 'final', reviewStatus: 'final', isolated: false });
    tables.rows(schema.finalizeReviews).push({
      ...tables.rows(schema.finalizeReviews)[0],
      id: BigInt(chapter * 100),
      chapter,
      draftRevision: 1,
      sourceHash: hashReviewedBody(body),
      status: 'applied',
      applied: [],
      appliedAt,
    });
  }

  it('should list a review waiting on the author with what it still asks', async () => {
    const { service, prepare } = setup();
    await prepare();

    const list = await service.list(7n);

    expect(list.waiting.map(review => [review.chapter, review.status, review.open.consequential])).toEqual([[5, 'ready', 1]]);
    expect(list.applied).toEqual([]);
  });

  it('should name a review whose reading job still runs as settling', async () => {
    const { tables, service, prepare, review } = setup();
    await prepare();
    review()['jobId'] = 'job-1';
    const queried: unknown[] = [];
    Object.assign(tables.db.query, { jobs: { findMany: async (query: unknown) => (queried.push(query), [{ id: 'job-1' }]) } });

    const list = await service.list(7n);

    expect(list.settling).toEqual([500n]);
    expect(queried).toHaveLength(1);
  });

  it('should name nothing settling once the reading job is done', async () => {
    const { tables, service, prepare, review } = setup();
    await prepare();
    review()['jobId'] = 'job-1';
    Object.assign(tables.db.query, { jobs: { findMany: async () => [] } });

    expect((await service.list(7n)).settling).toEqual([]);
  });

  it('should leave out a review the prose moved past, since approving again stages a new one', async () => {
    const { tables, service, prepare } = setup();
    await prepare();
    Object.assign(tables.draft(5) as object, { revision: 4, body: `${PROSE} Edited.` });

    expect((await service.list(7n)).waiting).toEqual([]);
  });

  it('should list updates written in the last day, and name the latest final chapter as the one undo accepts', async () => {
    const { tables, service } = setup();
    appliedChapter(tables, 3, new Date(Date.now() - RECENTLY_APPLIED_MS - 60_000));
    appliedChapter(tables, 4, new Date());

    const list = await service.list(7n);

    expect(list.applied.map(review => [review.chapter, review.appliedRevision])).toEqual([[4, 1]]);
    expect(list.undoableChapter).toBe(4);
  });

  it('should name no undoable chapter once a later chapter is final', async () => {
    const { tables, service } = setup();
    appliedChapter(tables, 4, new Date());
    tables.rows(schema.chapters).push({ id: 600n, projectId: 7n, number: 5, status: 'done' });

    expect((await service.list(7n)).undoableChapter).toBeNull();
  });
});

describe('FinalizeReviewService — undoing what approval added', () => {
  const MILESTONE_PROSE = 'The lamp burns cold.';

  /** Chapter 5's plan claims the fourth rank, its prose reaches it, and the author approves it: the only update is that routine reach. */
  function approvedChapterFive() {
    const tables = planTables({
      milestones: [{ milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank' }],
      entities: [{ entityKey: 'mira', name: 'Mira' }],
      briefs: [{ chapter: 5, claimedMilestones: ['lamp_rank_4'], knowledgeContract: { pov: ['mira'], learns: [] } }],
      drafts: [{ id: 55n, chapter: 5, revision: 2, body: MILESTONE_PROSE, reviewStatus: 'approved', approvedRevision: 2, summary: 'Mira ranks up.' }],
      storyCurrentChapter: 4,
    });
    tables.rows(schema.finalizeReviews).push({
      id: 500n,
      projectId: 7n,
      chapter: 5,
      draftId: 55n,
      draftRevision: 2,
      sourceHash: hashReviewedBody(MILESTONE_PROSE),
      planHash: null,
      isolated: false,
      bridgeOnly: false,
      status: 'preparing',
      error: null,
      applied: null,
      appliedAt: null,
      revertedAt: null,
    });
    const extraction: ContinuityOutput = { ...EXTRACTION, appeared: [], threads: [], characterStates: [], milestones: [{ milestoneKey: 'lamp_rank_4', reached: true }] };
    const insert = tables.db.insert;
    const db = { ...tables.db, insert: (table: unknown) => (table === schema.chapters ? { values: () => ({ onConflictDoUpdate: async () => undefined }) } : insert(table)) };
    db.transaction = async run => run(db);
    const generation = {
      finalizeReadiness: async () => ({ ready: true, blockers: [] }),
      finalize: async () => {
        const input = { projectId: '7', chapter: 5, runId: 'run-1', draftId: '55', draftRevision: 2, prose: MILESTONE_PROSE, summary: 'Mira ranks up.' };
        await commitFinalProse(db as never, { ...input, title: 'Cold Light', generator: 'standard', isolated: false });
        return { status: 'completed', outcome: 'completed' };
      },
    };
    const service = new FinalizeReviewService(
      { getPostgresClient: () => tables.db } as never,
      { structured: async () => extraction } as never,
      { register: () => undefined } as never,
      generation as never,
    );
    return { tables, service };
  }

  it('should take back exactly what the automatic finalize wrote', async () => {
    const { tables, service } = approvedChapterFive();
    await service.runJob({ payload: { reviewId: '500' } } as never);
    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached', reachedChapter: 5 });
    expect(tables.rows(schema.finalizeReviews)[0]?.['status']).toBe('applied');

    await service.revert(7n, 5);

    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'open', reachedChapter: null });
    expect(tables.rows(schema.finalizeReviews)[0]?.['status']).toBe('reverted');
  });

  it('should refuse the undo once a later chapter is final, leaving the updates in place', async () => {
    const { tables, service } = approvedChapterFive();
    await service.runJob({ payload: { reviewId: '500' } } as never);
    tables.rows(schema.chapters).push({ id: 600n, projectId: 7n, number: 6, status: 'done' });

    await expect(service.revert(7n, 5)).rejects.toMatchObject({ code: 'FRV_012' });
    expect(tables.milestone('lamp_rank_4')).toMatchObject({ state: 'reached' });
  });
});
