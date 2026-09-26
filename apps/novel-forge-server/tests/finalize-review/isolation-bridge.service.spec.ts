import { describe, expect, it } from 'bun:test';

import { type ContinuityOutput } from '@modules/ai/schemas';
import { appliedRevision, FinalizeReviewService } from '@modules/finalize-review/finalize-review.service';
import { hashReviewedBody } from '@modules/review/review-findings';
import { schema } from '@server/database';

import { planTables } from '../knowledge/plan-tables';

const PROSE = 'Mira walks the flooded cellar alone.';
const AMENDED = `${PROSE} The door holds.`;

const EXTRACTION: ContinuityOutput = {
  appeared: ['mira'],
  newEntities: [],
  threads: [],
  mysteries: [],
  timeline: [],
  relationships: [],
  power: [],
  characterStates: [{ entityKey: 'mira', location: 'the cellar', evidence: PROSE }],
  knowledgeChanges: [],
  chapterSummary: 'Mira spent the night below and came back quiet.',
  milestones: [],
};

function setup(draft: Record<string, unknown> = {}) {
  const tables = planTables({
    entities: [{ entityKey: 'mira', name: 'Mira' }],
    drafts: [{ id: 55n, chapter: 5, revision: 3, body: AMENDED, status: 'final', reviewStatus: 'approved', isolated: true, ...draft }],
    storyCurrentChapter: 5,
  });
  tables.rows(schema.finalizeReviews).push({
    id: 0n,
    projectId: 7n,
    chapter: 5,
    draftId: 55n,
    draftRevision: 2,
    sourceHash: hashReviewedBody(PROSE),
    planHash: null,
    isolated: true,
    bridgeOnly: false,
    status: 'applied',
    error: null,
    appliedAt: new Date(0),
    revertedAt: null,
  });
  const enqueued: bigint[] = [];
  const generation = { prepareFinalizeReview: async (_projectId: bigint, _chapter: number, reviewId: bigint) => void enqueued.push(reviewId) };
  const router = { structured: async () => EXTRACTION };
  const service = new FinalizeReviewService({ getPostgresClient: () => tables.db } as never, router as never, { registerHandler: () => undefined } as never, generation as never);
  return { tables, service, enqueued };
}

describe('FinalizeReviewService — isolation bridge', () => {
  it('should read an amended final chapter’s bridge again, asking only for its summary, and let it cross once approved', async () => {
    const { service, enqueued } = setup();

    expect(await service.bridge(7n, 5)).toMatchObject({ revision: 3, approved: false, summary: null });
    const staged = await service.prepareBridge(7n, 5);
    expect(staged).toMatchObject({ draftRevision: 3, status: 'preparing', bridgeOnly: true, isolated: true, current: true });
    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);
    const ready = await service.get(7n, 5);
    expect(ready.consequential.map(item => item.category)).toEqual(['summary']);
    expect(ready.routine).toEqual([]);
    expect(await service.bridge(7n, 5)).toMatchObject({ approved: false });

    await service.decide(7n, 5, ready.consequential[0]?.id as bigint, { decision: 'edited', edited: { text: 'Mira came back from the cellar.' } });

    expect(await service.bridge(7n, 5)).toEqual({
      chapter: 5,
      revision: 3,
      approved: true,
      summary: 'Mira came back from the cellar.',
      positions: [],
      droppedByHardLine: 0,
      droppedOverLength: 0,
    });
  });

  it('should drop an approved bridge the moment the chapter’s text changes', async () => {
    const { tables, service, enqueued } = setup();
    await service.prepareBridge(7n, 5);
    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);
    const summary = (await service.get(7n, 5)).consequential[0];
    await service.decide(7n, 5, summary?.id as bigint, { decision: 'kept' });

    Object.assign(tables.draft(5) as object, { revision: 4, body: `${AMENDED} Again.` });

    expect(await service.bridge(7n, 5)).toMatchObject({ revision: 4, approved: false, summary: null });
  });

  it('should keep a reverted bridge crossing, and read it again beside the audit record rather than reuse it, asking for the summary anew', async () => {
    const { tables, service, enqueued } = setup({ revision: 2, body: PROSE });
    const audit = tables.rows(schema.finalizeReviews)[0] as Record<string, unknown>;
    Object.assign(audit, { status: 'reverted', revertedAt: new Date(0) });
    tables
      .rows(schema.finalizeReviewItems)
      .push({ id: 900n, reviewId: 0n, itemKey: 'summary', category: 'summary', decision: 'kept', proposed: { category: 'summary', text: 'Mira came back.' } });
    expect(await service.bridge(7n, 5)).toMatchObject({ approved: true, summary: 'Mira came back.' });

    const staged = await service.prepareBridge(7n, 5);
    expect(tables.locks).toEqual([schema.projects, schema.drafts, schema.finalizeReviews]);
    expect(staged).toMatchObject({ draftRevision: 2, status: 'preparing', bridgeOnly: true });
    expect(audit).toMatchObject({ status: 'reverted', bridgeOnly: false });
    expect(await service.bridge(7n, 5)).toMatchObject({ approved: true, summary: 'Mira came back.' });

    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);
    const asked = (await service.get(7n, 5)).consequential;
    expect(asked.map(item => [item.category, item.decision])).toEqual([['summary', null]]);
    expect(await service.bridge(7n, 5)).toMatchObject({ approved: true, summary: 'Mira came back.' });

    await service.decide(7n, 5, asked[0]?.id as bigint, { decision: 'edited', edited: { text: 'Mira came back at dawn.' } });
    expect(await service.bridge(7n, 5)).toMatchObject({ approved: true, summary: 'Mira came back at dawn.' });
  });

  it('should let a skipped summary on the bridge read again decide, so nothing of the old one crosses', async () => {
    const { tables, service, enqueued } = setup({ revision: 2, body: PROSE });
    Object.assign(tables.rows(schema.finalizeReviews)[0] as object, { status: 'reverted' });
    tables
      .rows(schema.finalizeReviewItems)
      .push({ id: 900n, reviewId: 0n, itemKey: 'summary', category: 'summary', decision: 'kept', proposed: { category: 'summary', text: 'Mira came back.' } });
    await service.prepareBridge(7n, 5);
    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);
    const [summary] = (await service.get(7n, 5)).consequential;

    await service.decide(7n, 5, summary?.id as bigint, { decision: 'skipped', reason: 'nothing of this chapter should reach the rest' });

    expect(await service.bridge(7n, 5)).toMatchObject({ approved: false, summary: null });
  });

  it('should answer a second request with the bridge already waiting for the author, not a third review', async () => {
    const { tables, service, enqueued } = setup();
    await service.prepareBridge(7n, 5);
    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);

    await service.prepareBridge(7n, 5);

    expect(enqueued).toHaveLength(1);
    expect(tables.rows(schema.finalizeReviews)).toHaveLength(2);
  });

  it('should name the applied revision beneath a bridge read again over it, and none once it is undone or when there are no reviews', async () => {
    const { tables, service, enqueued } = setup();
    await service.prepareBridge(7n, 5);
    await service.runJob({ payload: { reviewId: String(enqueued[0]) } } as never);

    expect(await service.get(7n, 5)).toMatchObject({ bridgeOnly: true, draftRevision: 3, appliedRevision: 2 });

    Object.assign(tables.rows(schema.finalizeReviews)[0] as object, { status: 'reverted' });
    expect(await service.get(7n, 5)).toMatchObject({ bridgeOnly: true, appliedRevision: null });
    expect(appliedRevision([])).toBeNull();
  });

  it('should refuse a bridge for a chapter that is not final or not isolated', async () => {
    await expect(setup({ status: 'draft' }).service.prepareBridge(7n, 5)).rejects.toMatchObject({ code: 'BRG_002' });
    await expect(setup({ isolated: false }).service.prepareBridge(7n, 5)).rejects.toMatchObject({ code: 'BRG_001' });
    await expect(setup({ isolated: false }).service.bridge(7n, 5)).rejects.toMatchObject({ code: 'BRG_001' });
  });
});
