import { describe, expect, it } from 'bun:test';

import { type PersistDraftInput, persistGeneratedDraft } from '@modules/ai/graphs/chapter-generation.graph';
import { schema } from '@server/database';

import { type DraftRow, draftRow, fakeGenerationDb, render } from '../generation/generation-fixtures';

const INPUT: PersistDraftInput = {
  projectId: '1',
  chapter: 4,
  volumeKey: 'vol_1',
  runId: 'run-1',
  attempt: 0,
  repairMode: 'patch',
  writerClassRaised: false,
  title: 'Low Water',
  prose: 'The ferry waits for a tide that never turns.',
  summary: 'The ferry is stranded.',
  continuationState: {},
};

function setup(draftReads: (DraftRow | undefined)[], upserted?: DraftRow) {
  const fake = fakeGenerationDb({ draftReads, draftWriteResult: upserted ? [upserted] : [] });
  let outcome: 'committed' | 'rolled back' | undefined;
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await fake.db.transaction(run);
        outcome = 'committed';
        return result;
      } catch (error) {
        outcome = 'rolled back';
        throw error;
      }
    },
  };
  return { fake, db: db as never, outcome: () => outcome };
}

describe('persistGeneratedDraft', () => {
  it('should refuse a final draft and roll back the snapshot and continuity reset made before the upsert', async () => {
    const run = setup([draftRow(), draftRow({ status: 'final' })]);

    await expect(persistGeneratedDraft(run.db, INPUT)).rejects.toMatchObject({ code: 'DRF_002' });

    expect(run.outcome()).toBe('rolled back');
    expect(run.fake.writesTo(schema.draftRevisions)).toEqual([expect.objectContaining({ values: expect.objectContaining({ draftId: 11n, revision: 2 }) })]);
    expect(run.fake.writesTo(schema.continuityProposals, 'delete')).toHaveLength(1);
    expect(run.fake.writesTo(schema.drafts, 'update')).toEqual([]);
  });

  it('should only update an existing draft that is not final', async () => {
    const run = setup([draftRow()], draftRow({ revision: 3 }));

    await persistGeneratedDraft(run.db, INPUT);

    const setWhere = render(run.fake.writesTo(schema.drafts, 'upsert')[0]?.setWhere);
    expect(setWhere.sql).toBe('"drafts"."status" <> $1');
    expect(setWhere.params).toEqual(['final']);
  });

  it('should record the persisted revision against the run that wrote it', async () => {
    const run = setup([draftRow()], draftRow({ revision: 3 }));

    const row = await persistGeneratedDraft(run.db, INPUT);

    expect(row.revision).toBe(3);
    expect(run.outcome()).toBe('committed');
    expect(run.fake.writesTo(schema.draftRevisions)).toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ draftId: 11n, revision: 3, source: 'generated', runId: 'run-1' }) }),
    );
  });
});
