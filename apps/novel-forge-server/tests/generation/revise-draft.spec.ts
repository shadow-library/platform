import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, makeGenerationService, render } from './generation-fixtures';

const REVISED = { title: 'The Tide Clerk', body: 'The keeper counts the ships twice and writes neither number down.', summary: 'The keeper hides the count.' };
const NOTE = { note: 'Slow the count down.' };

function setup(draftReads: (DraftRow | undefined)[], updated?: DraftRow) {
  const fake = fakeGenerationDb({ draftReads, draftWriteResult: updated ? [updated] : [] });
  let modelCalls = 0;
  const service = makeGenerationService(fake.db, {
    modelRouter: {
      structured: async () => {
        modelCalls++;
        return REVISED;
      },
    },
    contextAssembler: { forChapter: async () => ({ rendered: '' }) },
    pluginPolicy: { resolve: async () => ({ raised: false }) },
  });
  const draftUpdates = () => fake.writesTo(schema.drafts, 'update');
  return {
    service,
    modelCalls: () => modelCalls,
    proseUpdate: () => draftUpdates().find(write => write.values && 'body' in write.values),
    staleMarks: () => draftUpdates().filter(write => write.values && !('body' in write.values)),
    revisions: () => fake.writesTo(schema.draftRevisions),
    feedback: () => fake.writesTo(schema.userFeedback),
  };
}

describe('GenerationService.reviseDraft', () => {
  it('should refuse a draft that was already final before the model call without calling the model', async () => {
    const run = setup([draftRow({ status: 'final' })]);

    await expect(run.service.reviseDraft(1n, 4, NOTE)).rejects.toMatchObject({ code: 'DRF_002' });
    expect(run.modelCalls()).toBe(0);
  });

  it.each([
    ['as finalized when the draft became final', draftRow({ status: 'final', xmin: '4712' }), 'DRF_002'],
    ['as a conflict when the draft moved to a new revision', draftRow({ revision: 3, xmin: '4712' }), 'DRF_013'],
    ['as a conflict, not as stale, when the draft was marked stale', draftRow({ staleReason: 'ancestor chapter 3 was regenerated', xmin: '4712' }), 'DRF_013'],
    ['as a conflict when the re-read finds a live draft at the same revision', draftRow({ xmin: '4712' }), 'DRF_013'],
    ['as missing when the draft was deleted', undefined, 'DRF_001'],
  ])('should report a write refused during the model call %s', async (_, afterCall, code) => {
    const run = setup([draftRow(), afterCall]);

    await expect(run.service.reviseDraft(1n, 4, NOTE)).rejects.toMatchObject({ code });
    expect(run.revisions()).toEqual([]);
    expect(run.feedback()).toEqual([]);
    expect(run.staleMarks()).toEqual([]);
  });

  it('should bind the write to the id, base revision, non-final status and row version the model call read', async () => {
    const run = setup([draftRow({ staleReason: 'ancestor chapter 2 was revised' }), draftRow({ xmin: '4712' })]);

    await run.service.reviseDraft(1n, 4, NOTE).catch(() => undefined);

    const where = render(run.proseUpdate()?.where);
    expect(where.sql).toContain('"drafts"."id" = $1');
    expect(where.sql).toContain('"drafts"."revision" = $2');
    expect(where.sql).toContain('"drafts"."status" <> $3');
    expect(where.sql).toContain('"drafts".xmin::text = $4');
    expect(where.params).toEqual([11n, 2, 'final', '4711']);
    expect(render(run.proseUpdate()?.values?.revision as SQL).sql).toBe('"drafts"."revision" + 1');
  });

  it('should record the request and the revision the write produced, then mark later drafts stale', async () => {
    const updated = { ...draftRow({ revision: 3 }), body: REVISED.body };
    const run = setup([draftRow()], updated);

    const result = await run.service.reviseDraft(1n, 4, NOTE);

    expect(result).toEqual(updated);
    expect(run.feedback()).toEqual([expect.objectContaining({ values: expect.objectContaining({ disposition: 'revision_requested', note: NOTE.note }) })]);
    expect(run.revisions()).toEqual([
      expect.objectContaining({ values: expect.objectContaining({ draftId: 11n, revision: 3, source: 'revised', body: REVISED.body, feedbackId: 7n }) }),
    ]);
    expect(run.staleMarks().length).toBeGreaterThan(0);
  });
});
