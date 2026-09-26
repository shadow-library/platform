import { describe, expect, it } from 'bun:test';

import { WALLED_OFF_EXCERPT } from '@modules/ai/isolation-read-policy';
import { type ContinuityOutput } from '@modules/ai/schemas';
import { FinalizeReviewService } from '@modules/finalize-review/finalize-review.service';
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

function setup() {
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
    status: 'preparing',
    error: null,
    appliedAt: null,
    revertedAt: null,
  });
  const modelRouter: { structured: () => Promise<ContinuityOutput> } = { structured: async () => EXTRACTION };
  const service = new FinalizeReviewService({ getPostgresClient: () => tables.db } as never, modelRouter as never, { registerHandler: () => undefined } as never, {} as never);
  const prepare = () => service.runJob({ payload: { reviewId: '500' } } as never);
  const review = () => tables.rows(schema.finalizeReviews)[0] as Record<string, unknown>;
  return { tables, service, prepare, review, modelRouter };
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
