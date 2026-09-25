import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { setOpenDraftReview } from '@modules/ai/graphs/chapter-generation.graph';
import { type GenerationService } from '@modules/generation/generation.service';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, makeGenerationService, type RecordedWrite, render } from './generation-fixtures';

interface GuardCase {
  name: string;
  call: (service: GenerationService) => Promise<unknown>;
  kind: RecordedWrite['kind'];
  predicate: (write: RecordedWrite) => SQL | undefined;
  expected: string[];
}

const BODY = { title: 'Low Water', body: 'The ferry waits for a tide that never turns.', summary: 'The ferry is stranded.' };

const GUARDED_WRITES: GuardCase[] = [
  { name: 'updateDraft', call: service => service.updateDraft(1n, 4, BODY), kind: 'upsert', predicate: write => write.setWhere, expected: ['"drafts"."status" <> $'] },
  {
    name: 'importDraft',
    call: service => service.importDraft(1n, 4, { title: BODY.title, prose: BODY.body, summary: BODY.summary }),
    kind: 'upsert',
    predicate: write => write.setWhere,
    expected: ['"drafts"."status" <> $'],
  },
  { name: 'deleteDraft', call: service => service.deleteDraft(1n, 4), kind: 'delete', predicate: write => write.where, expected: ['"drafts"."status" <> $'] },
  {
    name: 'approveDraft',
    call: service => service.approveDraft(1n, 4, { revision: 2 }),
    kind: 'update',
    predicate: write => write.where,
    expected: ['"drafts"."revision" = $', '"drafts"."status" <> $', '"drafts"."stale_reason" is null', '"drafts"."review_status" <> $'],
  },
];

describe('GenerationService draft writes', () => {
  it.each(GUARDED_WRITES.map(guard => [guard.name, guard] as const))(
    'should refuse %s at the SQL write once the draft is final',
    async (_, { call, kind, predicate, expected }) => {
      const fake = fakeGenerationDb({ draftReads: [draftRow(), draftRow({ status: 'final' })] });

      await expect(call(makeGenerationService(fake.db))).rejects.toMatchObject({ code: 'DRF_002' });

      const [write] = fake.writesTo(schema.drafts, kind);
      const rendered = render(predicate(write!)).sql;
      for (const fragment of expected) expect(rendered).toContain(fragment);
      expect(fake.writesTo(schema.draftRevisions)).toEqual([]);
    },
  );
});

describe('GenerationService draft write refusals', () => {
  it('should report a hand edit refused on a live stale draft as a conflict, never as a reason to regenerate', async () => {
    const fake = fakeGenerationDb({ draftReads: [draftRow(), draftRow({ staleReason: 'ancestor chapter 3 was regenerated' })] });

    await expect(makeGenerationService(fake.db).updateDraft(1n, 4, BODY)).rejects.toMatchObject({ code: 'DRF_013' });
  });
});

describe('GenerationService.approveDraft', () => {
  it('should report a draft that went stale before the approval landed as stale', async () => {
    const fake = fakeGenerationDb({ draftReads: [draftRow(), draftRow({ staleReason: 'ancestor chapter 3 was regenerated' })] });

    await expect(makeGenerationService(fake.db).approveDraft(1n, 4, { revision: 2 })).rejects.toMatchObject({ code: 'DRF_007' });
  });

  it('should report a live, fresh draft that refused the approval as a conflict', async () => {
    const fake = fakeGenerationDb({ draftReads: [draftRow(), draftRow()] });

    await expect(makeGenerationService(fake.db).approveDraft(1n, 4, { revision: 2 })).rejects.toMatchObject({ code: 'DRF_013' });
  });
});

describe('GenerationService.judgeDraft', () => {
  function judgeService(draft = draftRow(), draftReads: DraftRow[] = []) {
    const fake = fakeGenerationDb({ draftReads: [draft, ...draftReads], draftWriteResult: draftReads.length > 0 ? [] : [draft] });
    let modelCalls = 0;
    const model = { invoke: async () => ({ _getType: () => 'ai', content: '{"verdict":"consistent","findings":[]}' }) };
    const service = makeGenerationService(fake.db, {
      modelRouter: {
        chatFor: async () => {
          modelCalls++;
          return model;
        },
      },
      contextAssembler: { forChapter: async () => ({ rendered: '' }) },
      pluginPolicy: { resolve: async () => ({ raised: false }) },
      toolRegistry: { forNode: () => [], getRaw: () => [] },
    });
    return { fake, service, modelCalls: () => modelCalls };
  }

  it('should refuse a final draft before calling the model', async () => {
    const { service, modelCalls } = judgeService(draftRow({ status: 'final' }));

    await expect(service.judgeDraft(1n, 4)).rejects.toMatchObject({ code: 'DRF_002' });
    expect(modelCalls()).toBe(0);
  });

  it('should only record the verdict on the non-final revision it judged', async () => {
    const { fake, service } = judgeService();

    await service.judgeDraft(1n, 4);

    const where = render(fake.writesTo(schema.drafts, 'update')[0]?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."status" <> $3)');
    expect(where.params).toEqual([11n, 2, 'final']);
  });

  it('should discard a verdict about a revision the draft moved past during the call', async () => {
    const { fake, service } = judgeService(draftRow(), [draftRow({ revision: 3 })]);

    await expect(service.judgeDraft(1n, 4)).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
    expect(fake.outcome()).toBe('rolled back');
  });
});

describe('setOpenDraftReview', () => {
  it.each([
    ['judge', { judge: 'consistent', judgeNote: null, reviewStatus: 'needs_review' }],
    ['accept', { reviewStatus: 'needs_review' }],
    ['acceptAsIs and awaitReview', { reviewStatus: 'contradiction' }],
  ] as const)('should leave a final or approved draft untouched when %s records its review', async (_, review) => {
    const fake = fakeGenerationDb();

    await setOpenDraftReview(fake.db as never, '21', review);

    const [write] = fake.writesTo(schema.drafts, 'update');
    const where = render(write?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."status" <> $2 and "drafts"."review_status" <> $3)');
    expect(where.params).toEqual([21n, 'final', 'approved']);
    expect(write?.values).toMatchObject(review);
  });
});
