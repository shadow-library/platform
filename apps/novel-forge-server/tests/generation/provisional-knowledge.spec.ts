import { describe, expect, it } from 'bun:test';
import { AIMessage } from '@langchain/core/messages';
import { type SQL } from 'drizzle-orm';

import { UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { type GenerationService } from '@modules/generation/generation.service';
import { markDescendantDraftsStale, REVEAL_STALE_PREFIX } from '@server/common';
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
    chapterImages: { onChapterDeleted: async () => undefined },
    pluginPolicy: { resolve: async () => ({ writerClass: 'permissive', raised: false }) },
  });
  const revocations = () => fake.writesTo(schema.characterKnowledge, 'delete').map(write => statement(write.where));
  return { fake, service, revocations };
}

describe('GenerationService.approveDraft', () => {
  it('should approve the revision the author read and ledger its brief reveals in the same transaction', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow()], draftWriteResult: [draftRow()], knowledge: knowledgeFixture() });

    await service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n });

    const [approval] = fake.writesTo(schema.drafts, 'update');
    const where = render(approval?.where);
    expect(where.sql).toBe(
      '("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."save_seq" = $3 and "drafts"."status" <> $4 and "drafts"."stale_reason" is null and "drafts"."review_status" <> $5)',
    );
    expect(where.params).toEqual([11n, 2, 0, 'final', 'generating']);
    expect(approval?.values).toMatchObject({ reviewStatus: 'approved', approvedRevision: 2 });
    expect(fake.writesTo(schema.userFeedback)).toEqual([expect.objectContaining({ values: expect.objectContaining({ disposition: 'approved' }) })]);
    expect(fake.writesTo(schema.characterKnowledge).map(write => write.kind)).toEqual(['delete', 'upsert']);
    expect(statement(fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where)).toEqual(REVOKE_CHAPTER_4);
    expect(fake.writesTo(schema.characterKnowledge, 'upsert')[0]?.values).toEqual([
      { projectId: 1n, factId: 31n, entityId: 41n, learnedInChapter: 4, source: 'brief', status: 'provisional', draftRevision: 2 },
    ]);
    expect(fake.outcome()).toBe('committed');
  });

  it('should refuse a revision the draft has already moved past before opening a transaction', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow({ revision: 3 })], knowledge: knowledgeFixture() });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writes).toEqual([]);
  });

  it('should refuse a revision that moved between the read and the write without an audit row or a ledger row', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow(), draftRow({ revision: 3 })], knowledge: knowledgeFixture() });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writesTo(schema.userFeedback)).toEqual([]);
    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
    expect(fake.outcome()).toBe('rolled back');
  });

  it('should refuse an approval that lost the race to a finalize of the same revision, leaving the committed knowledge alone', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow(), draftRow({ status: 'final' })], knowledge: knowledgeFixture() });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n })).rejects.toMatchObject({ code: 'DRF_002' });
    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
    expect(fake.outcome()).toBe('rolled back');
  });
});

describe('GenerationService.approveDraft — approving a stale draft as written', () => {
  const STALE = 'ancestor chapter 3 was hand_edited';

  it('should clear exactly the stale reason the author saw, record the override and mark nothing else stale', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow({ staleReason: STALE })], draftWriteResult: [draftRow()], knowledge: knowledgeFixture() });

    await service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n, keepStale: true, staleReason: STALE });

    const draftUpdates = fake.writesTo(schema.drafts, 'update');
    expect(draftUpdates).toHaveLength(1);
    expect(draftUpdates[0]?.values).toMatchObject({ reviewStatus: 'approved', staleReason: null });
    expect(statement(draftUpdates[0]?.where)).toEqual({
      sql: '("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."save_seq" = $3 and "drafts"."status" <> $4 and "drafts"."stale_reason" = $5 and "drafts"."review_status" <> $6)',
      params: [11n, 2, 0, 'final', STALE, 'generating'],
    });
    expect(fake.writesTo(schema.userFeedback)[0]?.values).toMatchObject({ disposition: 'approved', note: `approved as written over: ${STALE}` });
    expect(fake.outcome()).toBe('committed');
  });

  it('should refuse a stale draft without the author asking to keep it', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow({ staleReason: STALE })] });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n })).rejects.toMatchObject({ code: 'DRF_007' });
    expect(fake.writes).toEqual([]);
  });

  it('should refuse to keep a draft whose plan reveals what no longer holds', async () => {
    const reason = `${REVEAL_STALE_PREFIX}lamp_rank_4_rule (needs milestone lamp_rank_4 reached)`;
    const { fake, service } = serviceOver({ draftReads: [draftRow({ staleReason: reason })] });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n, keepStale: true, staleReason: reason })).rejects.toMatchObject({ code: 'DRF_017' });
    expect(fake.writes).toEqual([]);
  });

  it('should refuse when the draft went stale for another reason than the one the author saw', async () => {
    const { fake, service } = serviceOver({ draftReads: [draftRow({ staleReason: 'ancestor chapter 2 was revised' })] });

    await expect(service.approveDraft(1n, 4, { revision: 2, saveSeq: 0, draftId: 11n, keepStale: true, staleReason: STALE })).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writes).toEqual([]);
  });
});

describe('provisional brief reveals', () => {
  const draftChanges: [string, (service: GenerationService) => Promise<unknown>, DraftRow[]][] = [
    ['a hand edit', service => service.updateDraft(1n, 4, PROSE), [draftRow()]],
    ['an import', service => service.importDraft(1n, 4, { title: PROSE.title, prose: PROSE.body, summary: PROSE.summary }), [draftRow()]],
    ['a revision', service => service.reviseDraft(1n, 4, { note: 'Slow the count down.' }), [draftRow()]],
    ['a deletion', service => service.deleteDraft(1n, 4), [draftRow()]],
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

  it.each(draftChanges.filter(([name]) => name === 'a hand edit' || name === 'a deletion'))(
    "should mark every later draft stale and revoke this chapter's reveals after %s",
    async (_, change, draftReads) => {
      const { fake, service, revocations } = serviceOver({ draftReads, draftWriteResult: [draftRow({ revision: 3 })] });

      await change(service);

      const descendants = fake.writesTo(schema.drafts, 'update').map(write => statement(write.where));
      expect(descendants).toContainEqual({
        sql: '(("drafts"."project_id" = $1 and "drafts"."chapter" > $2 and "drafts"."status" <> $3) and ("drafts"."stale_reason" is null or "drafts"."stale_reason" like $4))',
        params: [1n, 4, 'final', `${REVEAL_STALE_PREFIX}%`],
      });
      expect(revocations()).toContainEqual(REVOKE_CHAPTER_4);
    },
  );

  it('should leave the ledger alone when the write is refused because the draft is final', async () => {
    const { service, revocations } = serviceOver({ draftReads: [draftRow(), draftRow({ status: 'final' })] });

    await expect(service.updateDraft(1n, 4, PROSE)).rejects.toMatchObject({ code: 'DRF_002' });
    expect(revocations()).toEqual([]);
  });

  it("should revoke the reveals of exactly the later drafts whose approval an ancestor's change reset", async () => {
    const fake = fakeGenerationDb({ resetDescendants: [5, 7] });

    await markDescendantDraftsStale(fake.db as never, 1n, 4, 'ancestor chapter 4 was hand_edited');

    const label = (table: unknown) => (table === schema.characterKnowledge ? 'knowledge' : table === schema.characterEvents ? 'events' : 'drafts');
    const kinds = fake.writes.map(write => `${label(write.table)}:${write.kind}`);
    expect(kinds).toEqual(['drafts:update', 'drafts:update', 'knowledge:delete', 'events:delete']);
    const reset = statement(fake.writesTo(schema.drafts, 'update')[1]?.where);
    expect(reset.sql).toBe('(("drafts"."project_id" = $1 and "drafts"."chapter" > $2 and "drafts"."status" <> $3) and "drafts"."review_status" = $4)');
    expect(statement(fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where)).toEqual({
      sql: '("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" in ($3, $4))',
      params: [1n, 'brief', 5, 7],
    });
    expect(statement(fake.writesTo(schema.characterEvents, 'delete')[0]?.where)).toEqual({
      sql: '("character_events"."project_id" = $1 and "character_events"."status" = $2 and "character_events"."chapter" in ($3, $4))',
      params: [1n, 'provisional', 5, 7],
    });
  });
});

describe('revokeProvisionalCharacterEvents', () => {
  it("should drop only the revoked chapters' provisional events, alongside the brief-sourced ledger rows", async () => {
    const { fake, service, revocations } = serviceOver({ draftReads: [draftRow()], draftWriteResult: [draftRow({ revision: 3 })] });

    await service.reviseDraft(1n, 4, { note: 'Slow the count down.' });

    expect(revocations()).toContainEqual(REVOKE_CHAPTER_4);
    expect(statement(fake.writesTo(schema.characterEvents, 'delete')[0]?.where)).toEqual({
      sql: '("character_events"."project_id" = $1 and "character_events"."status" = $2 and "character_events"."chapter" in ($3))',
      params: [1n, 'provisional', 4],
    });
  });
});
