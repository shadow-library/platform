import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { OpDependencyError } from '@server/classes';
import { schema } from '@server/database';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp, changeSetRefs, validateChangeSet } from '@modules/refinement/change-set';
import { type OpResult, ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { serialiseProposal } from '@modules/refinement/serialise';
import { type OpSource } from '@modules/refinement/write-policy';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

const TURN: ChangeOp[] = [
  { op: 'entity.upsert', entityKey: 'mara', type: 'character', name: 'Mara' },
  { op: 'milestone.upsert', milestoneKey: 'mara-escapes', label: 'Mara escapes the ledger house', subjectEntityKey: 'mara' },
  { op: 'entity.upsert', entityKey: 'ada', type: 'character', notes: 'Ada keeps the slip in her boot.', motivation: 'She wants the ledger back.' },
];
const SOURCES: OpSource[] = ['idea', 'idea', 'quoted'];
const ADA = { entityKey: 'ada', type: 'character', name: 'Ada', status: null, motivation: null, notes: 'Ada hides the slip.', body: null };

/** A transaction over in-memory tables that honours the filters the engine writes, so an apply, its per-change undo and a revert run end to end. */
async function fakeTurn(options: { kind?: string; projectId?: bigint } = {}) {
  const tables = new Map<unknown, Row[]>([
    [schema.entities, [{ id: 1n, projectId: 7n, ...ADA }]],
    [schema.milestones, []],
    [schema.briefs, []],
    [schema.volumes, []],
    [schema.canonFacts, []],
    [schema.userFeedback, []],
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
      entities: finder(schema.entities),
      milestones: finder(schema.milestones),
      briefs: finder(schema.briefs),
      volumes: finder(schema.volumes),
      canonFacts: finder(schema.canonFacts),
      plotThreads: finder(undefined),
      mysteries: finder(undefined),
      chapters: { findFirst: async () => undefined, findMany: async () => [] },
      drafts: { findFirst: async () => undefined, findMany: async () => [] },
    },
    select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ for: async () => rows(table).filter(row => matchesWhere(row, condition)) }) }) }),
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
  const proposal: Row = { id: 300n, projectId: options.projectId ?? 7n, kind: options.kind ?? 'chat', status: 'pending', changeSet: TURN, messageId: null, summary: null };
  rows(schema.refinementProposals).push(proposal);
  proposal['baseline'] = await loadArtifactStates(tx as never, 7n, changeSetRefs(TURN));
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, { has: () => true, get: mock(() => undefined) } as never);
  const entity = (key: string) => rows(schema.entities).find(row => row['entityKey'] === key);
  const statusOf = (index: number) => (proposal['opResults'] as OpResult[]).find(result => result.index === index)?.status;
  return { service, rows, proposal, entity, statusOf, applyTurn: () => service.apply(7n, 300n, { autoApplied: true, opSources: SOURCES }) };
}

describe('ProposalApplyService — per-change undo', () => {
  it('should keep each applied op’s source on the stored results, so a reloaded chat reads it back', async () => {
    const { applyTurn, proposal } = await fakeTurn();

    await applyTurn();

    const opResults = serialiseProposal(proposal as never).opResults;
    expect(opResults).toEqual([
      { index: 0, status: 'applied', source: 'idea' },
      { index: 1, status: 'applied', source: 'idea' },
      { index: 2, status: 'applied', source: 'quoted' },
    ]);
  });

  it('should undo one change and leave the rest of the turn applied', async () => {
    const { applyTurn, service, entity, rows, statusOf, proposal } = await fakeTurn();
    await applyTurn();

    const result = await service.undoOp(7n, 300n, 2);

    expect(result).toMatchObject({ changed: true, source: 'quoted' });
    expect(entity('ada')).toMatchObject({ notes: 'Ada hides the slip.', motivation: null });
    expect(entity('mara')).toBeDefined();
    expect(rows(schema.milestones)).toHaveLength(1);
    expect([statusOf(0), statusOf(1), statusOf(2)]).toEqual(['applied', 'applied', 'reverted']);
    expect(Object.keys(proposal['postState'] as object).sort()).toEqual(['entity:mara', 'milestone:mara-escapes']);
    expect(serialiseProposal(proposal as never).revertible).toBe(true);
  });

  it('should redo an undone change', async () => {
    const { applyTurn, service, entity, statusOf } = await fakeTurn();
    await applyTurn();
    await service.undoOp(7n, 300n, 2);

    const result = await service.redoOp(7n, 300n, 2);

    expect(result.changed).toBe(true);
    expect(entity('ada')).toMatchObject({ notes: 'Ada keeps the slip in her boot.' });
    expect(statusOf(2)).toBe('applied');
  });

  it('should refuse to undo a change another applied change relies on, listing it, and write nothing', async () => {
    const { applyTurn, service, entity, statusOf } = await fakeTurn();
    await applyTurn();

    const refusal = await service.undoOp(7n, 300n, 0).catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(OpDependencyError);
    expect(refusal).toMatchObject({ code: 'RFN_015', opIndexes: [1] });
    expect(entity('mara')).toBeDefined();
    expect(statusOf(0)).toBe('applied');
  });

  it('should undo a dependent first and then what it relied on, and redo them only in the opposite order', async () => {
    const { applyTurn, service, entity, rows } = await fakeTurn();
    await applyTurn();

    await service.undoOp(7n, 300n, 1);
    await service.undoOp(7n, 300n, 0);
    expect(entity('mara')).toBeUndefined();
    expect(rows(schema.milestones)).toEqual([]);

    await expect(service.redoOp(7n, 300n, 1)).rejects.toMatchObject({ code: 'RFN_016', opIndexes: [0] });
    await service.redoOp(7n, 300n, 0);
    await service.redoOp(7n, 300n, 1);
    expect(rows(schema.milestones)).toEqual([expect.objectContaining({ milestoneKey: 'mara-escapes', subjectEntityKey: 'mara' })]);
  });

  it('should treat a repeated undo or redo as done, writing nothing', async () => {
    const { applyTurn, service, rows } = await fakeTurn();
    await applyTurn();
    await service.undoOp(7n, 300n, 2);
    const feedback = rows(schema.userFeedback).length;

    expect(await service.undoOp(7n, 300n, 2)).toMatchObject({ changed: false, artifacts: [] });
    await service.redoOp(7n, 300n, 2);
    expect(await service.redoOp(7n, 300n, 2)).toMatchObject({ changed: false, artifacts: [] });
    expect(rows(schema.userFeedback)).toHaveLength(feedback + 1);
  });

  it('should revert the rest of the turn as a whole after one change was undone on its own', async () => {
    const { applyTurn, service, entity, rows, proposal } = await fakeTurn();
    await applyTurn();
    await service.undoOp(7n, 300n, 2);

    await service.revert(7n, 300n);

    expect(proposal['status']).toBe('reverted');
    expect(entity('mara')).toBeUndefined();
    expect(rows(schema.milestones)).toEqual([]);
    expect(entity('ada')).toMatchObject({ notes: 'Ada hides the slip.' });
    expect(await service.undoOp(7n, 300n, 0)).toMatchObject({ changed: false });
    await expect(service.redoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_017' });
  });

  it('should empty a field the turn filled when the whole turn is reverted', async () => {
    const { applyTurn, service, entity } = await fakeTurn();
    await applyTurn();
    expect(entity('ada')).toMatchObject({ motivation: 'She wants the ledger back.' });

    await service.revert(7n, 300n);

    expect(entity('ada')).toMatchObject({ notes: 'Ada hides the slip.', motivation: null });
  });

  it('should refuse the null a restore carries from any change-set a model or author sends', () => {
    const cleared = [
      { op: 'entity.upsert', entityKey: 'ada', type: 'character', motivation: null },
      { op: 'volume.upsert', volumeKey: 'volume_1', title: null },
      { op: 'fact.upsert', factKey: 'debt', constraintNote: null },
      { op: 'bible_document.upsert', section: 'world', slug: 'city', body: null },
      { op: 'premise.update', premise: null },
    ];

    for (const op of cleared) expect(validateChangeSet([op]).join()).toContain('invalid field');
  });

  it('should refuse an undo that cannot put the records back exactly as the apply found them', async () => {
    const { applyTurn, service, proposal } = await fakeTurn();
    await applyTurn();
    const record = (proposal['opUndo'] as { beforeState: Record<string, { contentHash: string | null }> }[])[2] as { beforeState: Record<string, { contentHash: string | null }> };
    Object.assign(record.beforeState['entity:ada'] as object, { contentHash: 'not what the undo leaves' });

    await expect(service.undoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_018' });
  });

  it('should run the caller’s follow-up inside the undo only when the change moved', async () => {
    const { applyTurn, service } = await fakeTurn();
    await applyTurn();
    const followUp = mock(async (_tx: unknown, change: { source?: OpSource }) => change.source);

    expect(await service.undoOp(7n, 300n, 1, followUp)).toMatchObject({ changed: true, followUp: 'idea' });
    const repeated = await service.undoOp(7n, 300n, 1, followUp);
    expect([repeated.changed, repeated.followUp]).toEqual([false, undefined]);
    expect(followUp).toHaveBeenCalledTimes(1);
  });

  it('should treat an undo after the whole turn was reverted as done, running no follow-up', async () => {
    const { applyTurn, service } = await fakeTurn();
    await applyTurn();
    await service.revert(7n, 300n);
    const followUp = mock(async () => 'rejected');

    expect(await service.undoOp(7n, 300n, 0, followUp)).toMatchObject({ changed: false, source: 'idea' });
    expect(followUp).not.toHaveBeenCalled();
  });

  it('should refuse to redo a change whose record moved on since it was undone', async () => {
    const { applyTurn, service, entity } = await fakeTurn();
    await applyTurn();
    await service.undoOp(7n, 300n, 2);
    Object.assign(entity('ada') as Row, { notes: 'The author rewrote this by hand.' });

    await expect(service.redoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_003' });
    expect(entity('ada')).toMatchObject({ notes: 'The author rewrote this by hand.', motivation: null });
  });

  it('should refuse to undo a change whose record moved on since the turn applied it', async () => {
    const { applyTurn, service, entity } = await fakeTurn();
    await applyTurn();
    Object.assign(entity('ada') as Row, { notes: 'The author rewrote this by hand.' });

    await expect(service.undoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_006' });
    expect(entity('ada')).toMatchObject({ notes: 'The author rewrote this by hand.' });
  });

  it('should refuse a per-change undo of a proposal the author applied from a card', async () => {
    const { service } = await fakeTurn();
    await service.apply(7n, 300n);

    await expect(service.undoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_014' });
  });

  it('should refuse a per-change undo of an automatic apply that is not a chat turn', async () => {
    const { service } = await fakeTurn({ kind: 'chapter_extract' });
    await service.apply(7n, 300n, { autoApplied: true });

    await expect(service.undoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_014' });
  });

  it('should not find a turn that belongs to another project', async () => {
    const { service } = await fakeTurn({ projectId: 8n });

    await expect(service.undoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_001' });
    await expect(service.redoOp(7n, 300n, 2)).rejects.toMatchObject({ code: 'RFN_001' });
  });

  it('should refuse an op index outside the change-set', async () => {
    const { applyTurn, service } = await fakeTurn();
    await applyTurn();

    await expect(service.undoOp(7n, 300n, 3)).rejects.toMatchObject({ code: 'RFN_011' });
  });
});
