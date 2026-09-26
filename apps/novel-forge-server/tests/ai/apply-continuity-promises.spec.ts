import { describe, expect, it } from 'bun:test';

import { applyContinuityDelta, type ContinuityTransaction } from '@modules/ai/graphs/apply-continuity';
import { type ContinuityOutput } from '@modules/ai/schemas/continuity.schema';
import { schema } from '@server/database';

import { queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

function delta(overrides: Partial<ContinuityOutput> = {}): ContinuityOutput {
  return {
    appeared: [],
    newEntities: [],
    threads: [],
    mysteries: [],
    timeline: [],
    relationships: [],
    power: [],
    characterStates: [],
    knowledgeChanges: [],
    chapterSummary: 'Nothing much happened.',
    ...overrides,
  };
}

/**
 * A transaction over in-memory thread/mystery tables good enough for `applyContinuityDelta`'s upsert calls: the `set` clauses it builds
 * are plain values now (P4-41 review), save for the summary/question `COALESCE` fragment, which this fake resolves the same way SQL would.
 */
function fakeTx(seed: { plotThreads?: Row[]; mysteries?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [schema.plotThreads, (seed.plotThreads ?? []).map(row => ({ projectId: 1n, ...row }))],
    [schema.mysteries, (seed.mysteries ?? []).map(row => ({ projectId: 1n, ...row }))],
  ]);
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({ findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0] });
  const upsert = (table: unknown, key: string, coalesceField: string) => ({
    values: (values: Row) => ({
      onConflictDoUpdate: async ({ set }: { set: Row }) => {
        const existing = rows(table).find(row => row[key] === values[key]);
        if (!existing) return void rows(table).push({ id: BigInt(rows(table).length + 1), ...values });
        for (const [field, value] of Object.entries(set)) {
          if (field === coalesceField) existing[field] = (values[coalesceField] as string | null) || existing[field];
          else existing[field] = value;
        }
      },
      onConflictDoNothing: async () => void 0,
    }),
  });
  const locked: unknown[] = [];
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => void locked.push(table) }) }) }),
    query: { plotThreads: finder(schema.plotThreads), mysteries: finder(schema.mysteries) },
    insert: (table: unknown) => (table === schema.plotThreads ? upsert(table, 'threadKey', 'summary') : upsert(table, 'mysteryKey', 'question')),
  } as unknown as ContinuityTransaction;
  return { tx, rows, locked };
}

describe('applyContinuityDelta — a dropped or dormant-on-purpose promise outranks extraction (P4-41)', () => {
  it('should lock each thread and mystery row before reading its status, so a concurrent drop cannot be overwritten', async () => {
    const { tx, locked } = fakeTx();

    await applyContinuityDelta(
      tx,
      1n,
      5,
      delta({ threads: [{ threadKey: 'ledger', status: 'open', summary: 'S.' }], mysteries: [{ mysteryKey: 'who', status: 'open', question: 'Who?' }] }),
    );

    expect(locked).toEqual([schema.plotThreads, schema.mysteries]);
  });

  it('should never reopen a dropped thread, whatever status extraction proposes', async () => {
    const { tx, rows } = fakeTx({
      plotThreads: [{ threadKey: 'ledger', status: 'dropped', summary: 'Old.', intentionallyOpen: false, closedChapter: null, lastAdvancedChapter: 2 }],
    });

    await applyContinuityDelta(tx, 1n, 5, delta({ threads: [{ threadKey: 'ledger', status: 'open', summary: 'Mira found the ledger.' }] }));

    expect(rows(schema.plotThreads)[0]).toMatchObject({ status: 'dropped' });
  });

  it('should never mark a dropped thread closed, whatever chapter extraction proposes it closed in', async () => {
    const { tx, rows } = fakeTx({
      plotThreads: [{ threadKey: 'ledger', status: 'dropped', summary: 'Old.', intentionallyOpen: false, closedChapter: null, lastAdvancedChapter: 2 }],
    });

    await applyContinuityDelta(tx, 1n, 5, delta({ threads: [{ threadKey: 'ledger', status: 'closed', summary: 'Mira found the ledger.' }] }));

    expect(rows(schema.plotThreads)[0]).toMatchObject({ status: 'dropped', closedChapter: null });
  });

  it('should never un-silence a thread the author marked dormant on purpose', async () => {
    const { tx, rows } = fakeTx({ plotThreads: [{ threadKey: 'ledger', status: 'open', summary: 'Old.', intentionallyOpen: true, closedChapter: null, lastAdvancedChapter: 2 }] });

    await applyContinuityDelta(tx, 1n, 5, delta({ threads: [{ threadKey: 'ledger', status: 'open', summary: 'Mira found the ledger.', intentionallyOpen: false }] }));

    expect(rows(schema.plotThreads)[0]).toMatchObject({ intentionallyOpen: true });
  });

  it('should still close an ordinary open thread extraction reports as closed', async () => {
    const { tx, rows } = fakeTx({ plotThreads: [{ threadKey: 'ledger', status: 'open', summary: 'Old.', intentionallyOpen: false, closedChapter: null, lastAdvancedChapter: 2 }] });

    await applyContinuityDelta(tx, 1n, 5, delta({ threads: [{ threadKey: 'ledger', status: 'closed', summary: 'Mira burned the ledger.' }] }));

    expect(rows(schema.plotThreads)[0]).toMatchObject({ status: 'closed', closedChapter: 5, summary: 'Mira burned the ledger.' });
  });

  it('should never reopen a dropped mystery, whatever status extraction proposes', async () => {
    const { tx, rows } = fakeTx({
      mysteries: [{ mysteryKey: 'who-took-it', status: 'dropped', question: 'Who took the ledger?', intentionallyOpen: false, resolvedChapter: null }],
    });

    await applyContinuityDelta(tx, 1n, 5, delta({ mysteries: [{ mysteryKey: 'who-took-it', status: 'resolved', question: 'Who took the ledger?' }] }));

    expect(rows(schema.mysteries)[0]).toMatchObject({ status: 'dropped', resolvedChapter: null });
  });
});
