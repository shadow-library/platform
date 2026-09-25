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

function commit(options: { finalized: boolean; reads?: (DraftRow | undefined)[]; input?: Partial<CommitProseInput> }) {
  const fake = fakeGenerationDb({ draftReads: options.reads ?? [], draftWriteResult: options.finalized ? [{ id: 11n }] : [] });
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

  it('should keep the reveals the approval ledgered', async () => {
    const { fake, run } = commit({ finalized: true });

    await run;

    expect(fake.writesTo(schema.characterKnowledge)).toEqual([]);
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
