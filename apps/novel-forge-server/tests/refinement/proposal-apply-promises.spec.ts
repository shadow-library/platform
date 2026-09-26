import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { loadArtifactStates } from '@modules/refinement/artifact-state';
import { type ChangeOp } from '@modules/refinement/change-set';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { schema } from '@server/database';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

/** A transaction over in-memory thread/mystery tables, so an apply and its revert run end to end. */
async function fakeProject(changeSet: ChangeOp[], seed: { plotThreads?: Row[]; mysteries?: Row[]; chapters?: Row[]; drafts?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [schema.plotThreads, (seed.plotThreads ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, ...row }))],
    [schema.mysteries, (seed.mysteries ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, ...row }))],
    [schema.chapters, (seed.chapters ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, ...row }))],
    [schema.drafts, (seed.drafts ?? []).map((row, index) => ({ id: BigInt(index + 1), projectId: 7n, ...row }))],
    [schema.refinementProposals, []],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({
    findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0],
    findMany: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query),
  });
  const tx = {
    query: {
      plotThreads: finder(schema.plotThreads),
      mysteries: finder(schema.mysteries),
      chapters: finder(schema.chapters),
      drafts: finder(schema.drafts),
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
  const refs = changeSet.flatMap(op =>
    op.op === 'promise.create' || op.op === 'promise.update' || op.op === 'promise.set_payoff' || op.op === 'promise.drop' ? [`promise:${op.kind}:${op.key}`] : [],
  );
  proposal.baseline = await loadArtifactStates(tx as never, 7n, refs);
  const executors = { has: () => true, get: mock(() => undefined) };
  const db = { transaction: async (run: (handle: unknown) => Promise<unknown>) => run(tx) };
  const service = new ProposalApplyService({ getPostgresClient: () => db } as never, executors as never);
  return { service, rows, proposal };
}

describe('ProposalApplyService — promises', () => {
  it('should create a thread promise and hard-delete it on revert', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.create', kind: 'thread', key: 'the-ledger', label: 'Who has the ledger.', openedChapter: 3 }]);

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)).toEqual([expect.objectContaining({ threadKey: 'the-ledger', status: 'open', summary: 'Who has the ledger.', openedChapter: 3 })]);

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)).toEqual([]);
  });

  it('should refuse creating a promise whose key already exists', async () => {
    const { service } = await fakeProject([{ op: 'promise.create', kind: 'thread', key: 'the-ledger', label: 'Who has the ledger.' }], {
      plotThreads: [{ threadKey: 'the-ledger', status: 'open', summary: 'Existing.', intentionallyOpen: false }],
    });

    await expect(service.apply(7n, 300n)).rejects.toMatchObject({ code: 'PMS_002' });
  });

  it('should update a promise label and revert it to the original', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.update', kind: 'mystery', key: 'who-took-it', label: 'Who really took the ledger?' }], {
      mysteries: [{ mysteryKey: 'who-took-it', status: 'open', question: 'Who took the ledger?', intentionallyOpen: false }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.mysteries)[0]).toMatchObject({ question: 'Who really took the ledger?' });

    await service.revert(7n, 300n);
    expect(rows(schema.mysteries)[0]).toMatchObject({ question: 'Who took the ledger?' });
  });

  it('should close a promise as paid off through promise.update.status, stamping the latest chapter, and revert it back to open with no chapter', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.update', kind: 'thread', key: 'the-ledger', status: 'paid_off' }], {
      plotThreads: [{ threadKey: 'the-ledger', status: 'open', summary: 'Who has the ledger.', intentionallyOpen: false, closedChapter: null }],
      chapters: [{ number: 5, status: 'done' }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ status: 'closed', closedChapter: 5 });

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ status: 'open', closedChapter: null });
  });

  it('should refuse a lastAdvancedChapter ahead of the latest chapter', async () => {
    const { service } = await fakeProject([{ op: 'promise.update', kind: 'thread', key: 'the-ledger', lastAdvancedChapter: 9 }], {
      plotThreads: [{ threadKey: 'the-ledger', status: 'open', summary: 'Who has the ledger.', intentionallyOpen: false }],
      chapters: [{ number: 3, status: 'done' }],
    });

    await expect(service.apply(7n, 300n)).rejects.toMatchObject({ code: 'PMS_003' });
  });

  it('should revert a null-summary thread back to null exactly, with no trimming or fallback', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.update', kind: 'thread', key: 'the-ledger', lastAdvancedChapter: 2 }], {
      plotThreads: [{ threadKey: 'the-ledger', status: 'open', summary: null, lastAdvancedChapter: null, intentionallyOpen: false }],
      chapters: [{ number: 5, status: 'done' }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ summary: null, lastAdvancedChapter: 2 });

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ summary: null, lastAdvancedChapter: null });
  });

  it('should refuse updating a promise that does not exist', async () => {
    const { service } = await fakeProject([{ op: 'promise.update', kind: 'thread', key: 'missing', label: 'x' }]);
    await expect(service.apply(7n, 300n)).rejects.toMatchObject({ code: 'PMS_001' });
  });

  it('should set a payoff target and dormancy, and revert to "someday" and not dormant', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.set_payoff', kind: 'thread', key: 'the-ledger', payoffMilestoneKey: 'reveal-1', dormant: true }], {
      plotThreads: [
        { threadKey: 'the-ledger', status: 'open', summary: 'Who has the ledger.', intentionallyOpen: false, payoffMilestoneKey: null, payoffVolumeKey: null, payoffWindow: null },
      ],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffMilestoneKey: 'reveal-1', intentionallyOpen: true });

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffMilestoneKey: null, intentionallyOpen: false });
  });

  it('should clear a payoff target with someday: true, and revert restores the original non-null values', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.set_payoff', kind: 'thread', key: 'the-ledger', someday: true }], {
      plotThreads: [
        {
          threadKey: 'the-ledger',
          status: 'open',
          summary: 'Who has the ledger.',
          intentionallyOpen: false,
          payoffMilestoneKey: 'reveal-1',
          payoffVolumeKey: null,
          payoffWindow: null,
        },
      ],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffMilestoneKey: null, payoffVolumeKey: null, payoffWindow: null });

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffMilestoneKey: 'reveal-1', payoffVolumeKey: null, payoffWindow: null });
  });

  it('should move a payoff from a volume to a chapter window, and revert restores the original volume', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.set_payoff', kind: 'thread', key: 'the-ledger', payoffWindow: 12, payoffVolumeKey: null }], {
      plotThreads: [
        {
          threadKey: 'the-ledger',
          status: 'open',
          summary: 'Who has the ledger.',
          intentionallyOpen: false,
          payoffMilestoneKey: null,
          payoffVolumeKey: 'vol_1',
          payoffWindow: null,
        },
      ],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffVolumeKey: null, payoffWindow: 12 });

    await service.revert(7n, 300n);
    expect(rows(schema.plotThreads)[0]).toMatchObject({ payoffVolumeKey: 'vol_1', payoffWindow: null });
  });

  it('should drop a mystery that was already resolved, and revert restores "resolved" rather than "open"', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.drop', kind: 'mystery', key: 'who-took-it' }], {
      mysteries: [{ mysteryKey: 'who-took-it', status: 'resolved', question: 'Who took the ledger?', intentionallyOpen: false, resolvedChapter: 4 }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.mysteries)[0]).toMatchObject({ status: 'dropped' });

    await service.revert(7n, 300n);
    expect(rows(schema.mysteries)[0]).toMatchObject({ status: 'resolved', resolvedChapter: 4 });
  });

  it('should drop a promise without deleting its row, and revert restores its prior status', async () => {
    const { service, rows } = await fakeProject([{ op: 'promise.drop', kind: 'mystery', key: 'who-took-it' }], {
      mysteries: [{ mysteryKey: 'who-took-it', status: 'open', question: 'Who took the ledger?', intentionallyOpen: false }],
    });

    await service.apply(7n, 300n);
    expect(rows(schema.mysteries)).toEqual([expect.objectContaining({ mysteryKey: 'who-took-it', status: 'dropped' })]);

    await service.revert(7n, 300n);
    expect(rows(schema.mysteries)[0]).toMatchObject({ status: 'open' });
  });

  it('should refuse dropping a promise that does not exist', async () => {
    const { service } = await fakeProject([{ op: 'promise.drop', kind: 'thread', key: 'missing' }]);
    await expect(service.apply(7n, 300n)).rejects.toMatchObject({ code: 'PMS_001' });
  });
});
