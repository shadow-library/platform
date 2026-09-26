import { describe, expect, it } from 'bun:test';

import { NOTES_MAX_WORDS, NotesStoreService } from '@modules/notes/notes-store.service';

type Row = Record<string, unknown>;

function makeWhereResult(rows: Row[]) {
  return {
    for: async () => rows,
    then: (resolve: (value: Row[]) => void, reject?: (reason: unknown) => void) => Promise.resolve(rows).then(resolve, reject),
  };
}

function makeService(initial?: Row) {
  let active: Row | undefined = initial;
  let nextId = 200n;
  const executeCalls: unknown[] = [];
  const appendCalls: { projectId: bigint; entries: Row[]; tx: unknown }[] = [];
  const supersedeCalls: { projectId: bigint; entryId: bigint; next: Row; tx: unknown }[] = [];
  const withdrawCalls: { projectId: bigint; entryId: bigint; reason: string; tx: unknown }[] = [];

  let transactionsOpened = 0;
  const db = {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      transactionsOpened++;
      return run(db);
    },
    execute: async (chunk: unknown) => {
      executeCalls.push(chunk);
    },
    select: () => ({ from: () => ({ where: () => makeWhereResult(active ? [active] : []) }) }),
  };
  const databaseService = { getPostgresClient: () => db } as never;

  const ledger = {
    append: async (projectId: bigint, entries: Row[], usedTx?: unknown) => {
      appendCalls.push({ projectId, entries, tx: usedTx });
      active = { id: nextId++, topic: entries[0]!.topic, statement: entries[0]!.statement, kind: entries[0]!.kind, createdAt: new Date('2026-01-01'), supersededAt: null };
      return [active];
    },
    supersede: async (projectId: bigint, entryId: bigint, next: Row, usedTx?: unknown) => {
      supersedeCalls.push({ projectId, entryId, next, tx: usedTx });
      active = { id: nextId++, topic: 'start.brief', statement: next.statement, kind: next.kind, createdAt: new Date('2026-01-02'), supersededAt: null };
      return active;
    },
    withdraw: async (projectId: bigint, entryId: bigint, reason: string, usedTx?: unknown) => {
      withdrawCalls.push({ projectId, entryId, reason, tx: usedTx });
      active = undefined;
      return {};
    },
  } as never;

  const service = new NotesStoreService(databaseService, ledger);
  return { service, appendCalls, supersedeCalls, withdrawCalls, executeCalls, db, getActive: () => active, transactionsOpened: () => transactionsOpened };
}

const manyWords = (count: number): string => Array.from({ length: count }, () => 'tide').join(' ');

describe('NotesStoreService.read', () => {
  it('should return the active entry’s text, id and when it was written', async () => {
    const { service } = makeService({ id: 5n, topic: 'start.brief', statement: 'Mira keeps the lamp lit.', createdAt: new Date('2026-01-01'), supersededAt: null });

    const record = await service.read(1n);

    expect(record).toMatchObject({ text: 'Mira keeps the lamp lit.', entryId: 5n, updatedAt: new Date('2026-01-01') });
  });

  it('should return an empty record when there are no notes yet', async () => {
    const { service } = makeService();

    const record = await service.read(1n);

    expect(record).toEqual({ text: '', entryId: undefined, updatedAt: undefined });
  });
});

describe('NotesStoreService.replace', () => {
  it('should append a direction-kind entry at the topic get_notes reads when there are no notes yet', async () => {
    const { service, appendCalls } = makeService();

    await service.replace(1n, 'Mira keeps the lamp lit.');

    expect(appendCalls[0]?.entries[0]).toMatchObject({ kind: 'direction', topic: 'start.brief', statement: 'Mira keeps the lamp lit.', decidedBy: 'author' });
  });

  it('should supersede the existing entry, keeping it a direction', async () => {
    const { service, supersedeCalls } = makeService({ id: 5n, topic: 'start.brief', statement: 'Old notes.', createdAt: new Date(), supersededAt: null });

    await service.replace(1n, 'New notes.');

    expect(supersedeCalls[0]).toMatchObject({ entryId: 5n, next: { kind: 'direction', statement: 'New notes.', decidedBy: 'author' } });
  });

  it('should withdraw the active entry instead of storing a blank one', async () => {
    const { service, withdrawCalls, appendCalls, getActive } = makeService({ id: 5n, topic: 'start.brief', statement: 'Old notes.', createdAt: new Date(), supersededAt: null });

    await service.replace(1n, '   ');

    expect(withdrawCalls[0]).toMatchObject({ entryId: 5n });
    expect(appendCalls).toHaveLength(0);
    expect(getActive()).toBeUndefined();
  });

  it('should do nothing for blank notes when there is nothing to withdraw', async () => {
    const { service, withdrawCalls } = makeService();

    await service.replace(1n, '');

    expect(withdrawCalls).toHaveLength(0);
  });

  it('should refuse notes over 10,000 words before writing anything', async () => {
    const { service, appendCalls } = makeService();

    await expect(service.replace(1n, manyWords(NOTES_MAX_WORDS + 1))).rejects.toMatchObject({ code: 'PRJ_012' });
    expect(appendCalls).toHaveLength(0);
  });

  it('should serialise the write with an advisory lock scoped to the project', async () => {
    const { service, executeCalls } = makeService();

    await service.replace(1n, 'Mira keeps the lamp lit.');

    expect(executeCalls).toHaveLength(1);
  });

  it('should run inside the caller’s transaction when one is given, instead of opening its own', async () => {
    const { service, appendCalls, db, transactionsOpened } = makeService();

    await service.replace(1n, 'Mira keeps the lamp lit.', db as never);

    expect(transactionsOpened()).toBe(0);
    expect(appendCalls[0]?.tx).toBe(db);
  });

  it('should open its own transaction when the caller does not supply one', async () => {
    const { service, transactionsOpened } = makeService();

    await service.replace(1n, 'Mira keeps the lamp lit.');

    expect(transactionsOpened()).toBe(1);
  });
});
