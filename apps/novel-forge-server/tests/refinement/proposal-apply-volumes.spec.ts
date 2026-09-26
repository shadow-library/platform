import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { schema } from '@server/database';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

/** A transaction over in-memory tables that honours the filters the engine writes, so an apply and its revert run end to end. */
async function fakeProject(changeSet: ChangeOp[], seed: { briefs?: Row[]; volumes?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [schema.briefs, (seed.briefs ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, revision: 1, contentHash: null, ...row }))],
    [schema.volumes, (seed.volumes ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, revision: 1, contentHash: null, ...row }))],
    [schema.refinementProposals, []],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({
    findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0],
    findMany: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query),
  });
  const tx = {
    query: {
      projects: { findFirst: async () => ({ id: 7n, premise: null, brief: null, themes: null, instructions: null, storyCurrentChapter: 0 }) },
      briefs: finder(schema.briefs),
      volumes: finder(schema.volumes),
    },
    select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => rows(table) }) }) }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (condition: SQL) => {
          const changed = rows(table).filter(row => matchesWhere(row, condition));
          for (const row of changed) Object.assign(row, values);
          return Object.assign(Promise.resolve(), { returning: async () => changed });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Row) => void rows(table).push({ id: BigInt(rows(table).length + 100), projectId: 7n, ...values }),
    }),
    delete: (table: unknown) => ({
      where: (condition: SQL) => {
        const removed = rows(table).filter(row => matchesWhere(row, condition));
        tables.set(
          table,
          rows(table).filter(row => !removed.includes(row)),
        );
        return Object.assign(Promise.resolve(), { returning: async () => removed });
      },
    }),
  };
  const proposal = { id: 300n, projectId: 7n, kind: 'chat', status: 'pending', changeSet, messageId: null, summary: null, baseline: {} as unknown };
  rows(schema.refinementProposals).push(proposal);
  const refs = changeSet.flatMap(op => ('volumeKey' in op && op.op.startsWith('volume') ? [`volume:${op.volumeKey}`] : 'chapter' in op ? [`chapter:${op.chapter}`] : []));
  proposal.baseline = await loadArtifactStates(tx as never, 7n, refs);
  const executors = { has: () => true, get: mock(() => undefined) };
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, executors as never);
  return { service, rows, proposal, executors };
}

describe('ProposalApplyService — volumes and briefs', () => {
  it('should revert a proposal that made a volume and moved a brief into it, taking the brief back out first', async () => {
    const { service, rows } = await fakeProject(
      [
        { op: 'volume.upsert', volumeKey: 'volume_2', ordinal: 2, objective: 'Steal the slip back.' },
        { op: 'brief.update', chapter: 3, volumeKey: 'volume_2' },
      ],
      { briefs: [{ chapter: 3, body: 'Ada hides the slip.', volumeKey: null, writeMode: 'standard', handEdited: false }] },
    );

    await service.apply(7n, 300n);
    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: 'volume_2' });

    await service.revert(7n, 300n);

    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: null });
    expect(rows(schema.volumes)).toEqual([]);
  });

  it('should revert a proposal that listed the brief before the new volume it moved into', async () => {
    const { service, rows } = await fakeProject(
      [
        { op: 'brief.update', chapter: 3, volumeKey: 'volume_2' },
        { op: 'volume.upsert', volumeKey: 'volume_2', ordinal: 2, objective: 'Steal the slip back.' },
      ],
      { briefs: [{ chapter: 3, body: 'Ada hides the slip.', volumeKey: null, writeMode: 'standard', handEdited: false }] },
    );

    await service.apply(7n, 300n);
    await service.revert(7n, 300n);

    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: null });
    expect(rows(schema.volumes)).toEqual([]);
  });

  it('should revert a proposal that created a brief in a new volume listed after it', async () => {
    const { service, rows } = await fakeProject([
      { op: 'brief.update', chapter: 1, body: 'Ada meets the clerk.', volumeKey: 'volume_1' },
      { op: 'volume.upsert', volumeKey: 'volume_1', ordinal: 1, objective: 'Get into the ledger house.' },
    ]);

    await service.apply(7n, 300n);
    await service.revert(7n, 300n);

    expect(rows(schema.briefs)).toEqual([]);
    expect(rows(schema.volumes)).toEqual([]);
  });

  it('should apply a volume removal listed before the move of its last brief, and revert it', async () => {
    const { service, rows } = await fakeProject(
      [
        { op: 'volume.remove', volumeKey: 'volume_1' },
        { op: 'brief.update', chapter: 3, volumeKey: 'volume_2' },
      ],
      {
        briefs: [{ chapter: 3, body: 'Ada hides the slip.', volumeKey: 'volume_1', writeMode: 'standard', handEdited: false }],
        volumes: [{ volumeKey: 'volume_1', ordinal: 1, title: 'The Ledger House', objective: 'Get in.', body: null }],
      },
    );

    await service.apply(7n, 300n);
    expect(rows(schema.volumes)).toEqual([]);
    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: 'volume_2' });

    await service.revert(7n, 300n);
    expect(rows(schema.volumes)).toEqual([expect.objectContaining({ volumeKey: 'volume_1', objective: 'Get in.' })]);
    expect(rows(schema.briefs)[0]).toMatchObject({ volumeKey: 'volume_1' });
  });

  it('should put a brief the chat creates without a volume into the volume of the nearest earlier plan', async () => {
    const { service, rows } = await fakeProject([{ op: 'brief.update', chapter: 5, body: 'Ada reaches the Assize.' }], {
      briefs: [
        { chapter: 2, body: 'Ada meets the clerk.', volumeKey: 'volume_1' },
        { chapter: 4, body: 'Ada steals the slip.', volumeKey: null },
      ],
    });

    await service.apply(7n, 300n);

    expect(rows(schema.briefs).find(row => row['chapter'] === 5)).toMatchObject({ volumeKey: 'volume_1' });
  });

  it('should keep a volume an existing brief already names when the op leaves it out', async () => {
    const { service, rows } = await fakeProject([{ op: 'brief.update', chapter: 3, title: 'The Slip' }], {
      briefs: [
        { chapter: 2, body: 'Ada meets the clerk.', volumeKey: 'volume_1' },
        { chapter: 3, body: 'Ada hides the slip.', volumeKey: null },
      ],
    });

    await service.apply(7n, 300n);

    expect(rows(schema.briefs).find(row => row['chapter'] === 3)).toMatchObject({ volumeKey: null, title: 'The Slip' });
  });
});

describe('ProposalApplyService — action.generate_chapter', () => {
  it('should refuse a blanket manual apply, so the author selects the generation step deliberately', async () => {
    const { service, executors } = await fakeProject([{ op: 'action.generate_chapter', chapter: 5 }]);

    await expect(service.apply(7n, 300n)).rejects.toMatchObject({ code: 'DRF_014' });
    expect(executors.get).not.toHaveBeenCalled();
  });

  it('should decline it in an auto-applied turn and leave the proposal pending', async () => {
    const { service, executors } = await fakeProject([{ op: 'action.generate_chapter', chapter: 5 }]);

    const result = await service.apply(7n, 300n, { autoApplied: true });

    expect(result.proposal.status).toBe('pending');
    expect(result.opResults).toEqual([{ index: 0, status: 'declined', note: expect.stringContaining('never applied automatically') }]);
    expect(executors.get).not.toHaveBeenCalled();
  });
});
