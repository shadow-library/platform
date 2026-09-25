import { describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { type SQL } from 'drizzle-orm';

import { UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { type GenerationService } from '@modules/generation/generation.service';
import { markDescendantDraftsStale } from '@server/common';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, type FakeGenerationDbOptions, knowledgeFixture, makeGenerationService, render } from './generation-fixtures';

const PROSE = { title: 'Low Water', body: 'The ferry waits for a tide that never turns.', summary: 'The ferry is stranded.' };
const REVOKE_CHAPTER_4 = {
  sql: '("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" = $3)',
  params: [1n, 'brief', 4],
};

function statement(where: SQL | undefined): { sql: string; params: unknown[] } {
  const { sql, params } = render(where);
  return { sql, params };
}

function serviceOver(options: FakeGenerationDbOptions) {
  const fake = fakeGenerationDb(options);
  const service = makeGenerationService(fake.db, {
    modelRouter: {
      resolveFor: async () => UNRESTRICTED_DEFAULTS.generation,
      structured: async () => PROSE,
      chatFor: async () => ({ invoke: async () => new AIMessage('{"verdict":"consistent","findings":[]}') }),
    },
    contextAssembler: { forChapter: async () => ({ rendered: '', renderedStable: '', renderedVolatile: '' }) },
    toolRegistry: { forNode: () => [], getRaw: () => [] },
    chapterImages: { onChapterDeleted: async () => undefined },
    pluginPolicy: { resolve: async () => ({ writerClass: 'permissive', raised: false }) },
  });
  const revocations = () => fake.writesTo(schema.characterKnowledge, 'delete').map(write => statement(write.where));
  return { fake, service, revocations };
}

describe('GenerationService.approveDraft', () => {
  it('should approve the revision the author read and ledger its brief reveals in the same transaction', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow()], draftWriteResult: [draftRow()], knowledge: knowledgeFixture() });

    await service.approveDraft(1n, 4, { revision: 2 });

    const [approval] = fake.writesTo(schema.drafts, 'update');
    const where = render(approval?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."status" <> $3 and "drafts"."stale_reason" is null and "drafts"."review_status" <> $4)');
    expect(where.params).toEqual([11n, 2, 'final', 'generating']);
    expect(fake.writesTo(schema.userFeedback)).toEqual([expect.objectContaining({ values: expect.objectContaining({ disposition: 'approved' }) })]);
    expect(fake.writesTo(schema.characterKnowledge, 'upsert')[0]?.values).toEqual([{ projectId: 1n, factId: 31n, entityId: 41n, learnedInChapter: 4, source: 'brief' }]);
    expect(fake.outcome()).toBe('committed');
  });

  it('should refuse a revision the draft has already moved past before opening a transaction', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow({ revision: 3 })], knowledge: knowledgeFixture() });

    await expect(service.approveDraft(1n, 4, { revision: 2 })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writes).toEqual([]);
  });

  it('should refuse a revision that moved between the read and the write without an audit row or a ledger row', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow(), draftRow({ revision: 3 })], knowledge: knowledgeFixture() });

    await expect(service.approveDraft(1n, 4, { revision: 2 })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writesTo(schema.userFeedback)).toEqual([]);
    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
    expect(fake.outcome()).toBe('rolled back');
  });
});

describe('provisional brief reveals', () => {
  const draftChanges: [string, (service: GenerationService) => Promise<unknown>, DraftRow[]][] = [
    ['a hand edit', service => service.updateDraft(1n, 4, PROSE), [draftRow()]],
    ['an import', service => service.importDraft(1n, 4, { title: PROSE.title, prose: PROSE.body, summary: PROSE.summary }), [draftRow()]],
    ['a revision', service => service.reviseDraft(1n, 4, { note: 'Slow the count down.' }), [draftRow()]],
    ['a deletion', service => service.deleteDraft(1n, 4), [draftRow()]],
    ['a judge verdict', service => service.judgeDraft(1n, 4), [draftRow()]],
    ['an unrestricted fill', service => service.generateUnrestricted(1n, 4, {}), [draftRow()]],
  ];

  it.each(draftChanges)("should revoke this chapter's brief-sourced ledger rows after %s", async (_, change, draftReads) => {
    const { fake, service, revocations } = serviceOver({ draftReads, draftWriteResult: [draftRow({ revision: 3 })] });

    await change(service);

    expect(revocations()).toContainEqual(REVOKE_CHAPTER_4);
    const draftsFirst = fake.writes.filter(write => write.table === schema.drafts || write.table === schema.characterKnowledge).map(write => write.table === schema.drafts);
    expect(draftsFirst.lastIndexOf(true)).toBeLessThan(draftsFirst.indexOf(false));
    expect(fake.outcome()).toBe('committed');
  });

  it('should leave the ledger alone when the write is refused because the draft is final', async () => {
    const { service, revocations } = serviceOver({ draftReads: [draftRow(), draftRow({ status: 'final' })] });

    await expect(service.updateDraft(1n, 4, PROSE)).rejects.toMatchObject({ code: 'DRF_002' });
    expect(revocations()).toEqual([]);
  });

  it("should revoke the reveals of exactly the later drafts whose approval an ancestor's change reset", async () => {
    const fake = fakeGenerationDb({ resetDescendants: [5, 7] });

    await markDescendantDraftsStale(fake.db as never, 1n, 4, 'ancestor chapter 4 was hand_edited');

    const kinds = fake.writes.map(write => `${write.table === schema.characterKnowledge ? 'knowledge' : 'drafts'}:${write.kind}`);
    expect(kinds).toEqual(['drafts:update', 'drafts:update', 'knowledge:delete']);
    const reset = statement(fake.writesTo(schema.drafts, 'update')[1]?.where);
    expect(reset.sql).toBe('(("drafts"."project_id" = $1 and "drafts"."chapter" > $2 and "drafts"."status" <> $3) and "drafts"."review_status" = $4)');
    expect(statement(fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where)).toEqual({
      sql: '("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" in ($3, $4))',
      params: [1n, 'brief', 5, 7],
    });
  });
});
