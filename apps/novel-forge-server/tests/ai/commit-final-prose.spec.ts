import { describe, expect, it } from 'bun:test';

import { commitFinalProse, type CommitProseInput } from '@modules/ai/graphs/chapter-finalization.graph';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, render } from '../generation/generation-fixtures';

const INPUT: CommitProseInput = {
  projectId: '1',
  chapter: 4,
  runId: 'run-9',
  draftId: '11',
  draftRevision: 2,
  prose: 'The keeper counts the ships.',
  summary: 'The keeper keeps count.',
  title: 'Low Water',
  generator: 'standard',
  isolated: false,
};

function commit(options: { finalized: boolean; reads?: (DraftRow | undefined)[]; input?: Partial<CommitProseInput>; finalSummary?: string }) {
  const effectiveSummary = options.input?.summary ?? INPUT.summary;
  const draftWriteResult = options.finalized ? [{ id: 11n, summary: options.finalSummary ?? effectiveSummary }] : [];
  const fake = fakeGenerationDb({ draftReads: options.reads ?? [], draftWriteResult });
  return { fake, run: commitFinalProse(fake.db as never, { ...INPUT, ...options.input }) };
}

describe('commitFinalProse', () => {
  it('should mark final only the approved, non-final draft at the revision finalize read', async () => {
    const { fake, run } = commit({ finalized: true });

    await run;

    const where = render(fake.writesTo(schema.drafts, 'update')[0]?.where);
    expect(where.sql).toBe('("drafts"."id" = $1 and "drafts"."revision" = $2 and "drafts"."review_status" = $3 and "drafts"."status" <> $4)');
    expect(where.params).toEqual([11n, 2, 'approved', 'final']);
    expect(fake.writesTo(schema.chapters, 'upsert')).toHaveLength(1);
    expect(fake.outcome()).toBe('committed');
  });

  it("should overwrite the committed summary with the finalizing UPDATE's own returned value, when a later save changed it", async () => {
    const { fake, run } = commit({ finalized: true, finalSummary: 'Updated after approval, before finalize committed.' });

    await run;

    const [chapterUpdate] = fake.writesTo(schema.chapters, 'update');
    expect(chapterUpdate?.values).toMatchObject({ summary: 'Updated after approval, before finalize committed.' });
  });

  it('should not touch the chapter row again when the finalizing UPDATE returns the summary already committed', async () => {
    const { fake, run } = commit({ finalized: true });

    await run;

    expect(fake.writesTo(schema.chapters, 'update')).toEqual([]);
  });

  it('should commit the provisional knowledge bound to the finalized revision and drop any bound to another', async () => {
    const { fake, run } = commit({ finalized: true });

    await run;

    const [committed] = fake.writesTo(schema.characterKnowledge, 'update');
    expect(committed?.values).toEqual({ status: 'committed' });
    expect(render(committed?.where)).toMatchObject({
      sql: '(("character_knowledge"."project_id" = $1 and "character_knowledge"."source" = $2 and "character_knowledge"."learned_in_chapter" = $3 and "character_knowledge"."status" = $4) and "character_knowledge"."draft_revision" = $5)',
      params: [1n, 'brief', 4, 'provisional', 2],
    });
    expect(render(fake.writesTo(schema.characterKnowledge, 'delete')[0]?.where).params).toEqual([1n, 'brief', 4, 'provisional']);
    expect(fake.outcome()).toBe('committed');
  });

  it('should commit the knowledge again on a resumed run, where it matches only what is still provisional', async () => {
    const { fake, run } = commit({ finalized: false, reads: [draftRow({ status: 'final' })] });

    await run;

    expect(render(fake.writesTo(schema.characterKnowledge, 'update')[0]?.where).params).toEqual([1n, 'brief', 4, 'provisional', 2]);
  });

  it('should commit no knowledge when an approval of a newer revision won the race', async () => {
    const reapproved = draftRow({ revision: 3 });
    const { fake, run } = commit({ finalized: false, reads: [reapproved, reapproved] });

    await expect(run).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
    expect(fake.writesTo(schema.canonFacts)).toEqual([]);
    expect(fake.outcome()).toBe('rolled back');
  });

  it('should roll the chapter back when a revise moved the draft past the revision finalize read', async () => {
    const moved = draftRow({ revision: 3 });
    const { fake, run } = commit({ finalized: false, reads: [moved, moved] });

    await expect(run).rejects.toMatchObject({ code: 'DRF_013' });
    expect(fake.outcome()).toBe('rolled back');
  });

  it('should roll the chapter back when the approval was reset at the same revision', async () => {
    const { fake, run } = commit({ finalized: false, reads: [draftRow()] });

    await expect(run).rejects.toMatchObject({ code: 'DRF_004' });
    expect(fake.outcome()).toBe('rolled back');
  });

  it('should let a resumed run through a draft its own earlier commit already made final', async () => {
    const { fake, run } = commit({ finalized: false, reads: [draftRow({ status: 'final' })] });

    await run;

    expect(fake.outcome()).toBe('committed');
  });

  it('should refuse a finalization that does not know which revision it read', async () => {
    const { fake, run } = commit({ finalized: false, input: { draftRevision: null } });

    await expect(run).rejects.toThrow('carries no draft revision');
    expect(fake.outcome()).toBe('rolled back');
  });
});
