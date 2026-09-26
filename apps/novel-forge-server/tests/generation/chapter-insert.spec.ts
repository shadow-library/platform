import { describe, expect, it } from 'bun:test';

import { ChapterInsertService } from '@modules/generation/chapter-insert.service';
import { type Ledger, schema } from '@server/database';

import { queryRows } from '../sql-filter';

type Chain = PromiseLike<unknown> & Record<string, (...args: unknown[]) => Chain>;

function chain(result: unknown, onSet?: (values: unknown) => void): Chain {
  return new Proxy(() => undefined, {
    get(_, prop) {
      if (prop === 'then') return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      if (prop === 'set')
        return (values: unknown) => {
          onSet?.(values);
          return chain(result);
        };
      return () => chain(result, onSet);
    },
  }) as unknown as Chain;
}

function fakeDatabase(ledger: { id: bigint; links: Ledger.Links }[], planned: Record<string, unknown>[] = []) {
  const briefs = planned.map(brief => ({ projectId: 1n, ...brief }));
  const ledgerUpdates: unknown[] = [];
  const updatedTables: unknown[] = [];
  const insertedBriefs: Record<string, unknown>[] = [];
  const none = { findFirst: async () => undefined, findMany: async () => [] };
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, status: 'active', kind: 'new_novel' }) },
      chapters: none,
      briefs: {
        findFirst: async (query: Parameters<typeof queryRows>[1]) => queryRows(briefs, query)[0],
        findMany: async (query: Parameters<typeof queryRows>[1]) => queryRows(briefs, query),
      },
      jobs: none,
      volumes: none,
    },
    select: () => ({ from: (table: unknown) => chain(table === schema.decisionLedgerEntries ? ledger : []) }),
    update: (table: unknown) => {
      updatedTables.push(table);
      return chain([], table === schema.decisionLedgerEntries ? values => ledgerUpdates.push(values) : undefined);
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === schema.briefs) insertedBriefs.push(values);
        return chain([{ chapter: 1, body: 'Ada meets the clerk.' }]);
      },
    }),
    delete: () => chain([]),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { databaseService: { getPostgresClient: () => db }, ledgerUpdates, updatedTables, insertedBriefs };
}

describe('ChapterInsertService.insertAfter', () => {
  it('should renumber the brief chapters the decision ledger links to', async () => {
    const { databaseService, ledgerUpdates } = fakeDatabase([{ id: 9n, links: { volumeKeys: ['vol_1'], briefChapters: [1, 2] } }]);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 0, { briefOrigin: 'hand', briefBody: 'Ada meets the clerk.' });

    expect(ledgerUpdates).toEqual([{ links: { volumeKeys: ['vol_1'], briefChapters: [2, 3] } }]);
  });

  it('should put the new chapter in the volume of the chapter it follows, and never touch a volume row', async () => {
    const briefs = [
      { chapter: 3, body: 'The toll doubles.', volumeKey: 'volume_2' },
      { chapter: 4, body: 'The ferry burns.', volumeKey: 'volume_3' },
    ];
    const { databaseService, insertedBriefs, updatedTables } = fakeDatabase([], briefs);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 3, { briefOrigin: 'hand', briefBody: 'Ada counts the tolls.' });

    expect(insertedBriefs).toEqual([expect.objectContaining({ chapter: 4, volumeKey: 'volume_2', writeMode: 'external' })]);
    expect(insertedBriefs[0]).not.toHaveProperty('arcKey');
    expect(updatedTables).not.toContain(schema.volumes);
  });

  it('should put a chapter inserted before the first one in the volume of chapter 1', async () => {
    const { databaseService, insertedBriefs } = fakeDatabase([], [{ chapter: 1, body: 'Ada meets the clerk.', volumeKey: 'volume_1' }]);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 0, { briefOrigin: 'hand', briefBody: 'A prologue on the river.' });

    expect(insertedBriefs[0]).toMatchObject({ chapter: 1, volumeKey: 'volume_1' });
  });

  it('should take the nearest earlier planned volume when the chapter it follows names none', async () => {
    const briefs = [
      { chapter: 2, body: 'The clerk lies.', volumeKey: 'volume_1' },
      { chapter: 3, body: 'The toll doubles.', volumeKey: null },
      { chapter: 4, body: 'The ferry burns.', volumeKey: 'volume_2' },
    ];
    const { databaseService, insertedBriefs } = fakeDatabase([], briefs);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 3, { briefOrigin: 'hand', briefBody: 'Ada counts the tolls.' });

    expect(insertedBriefs[0]).toMatchObject({ chapter: 4, volumeKey: 'volume_1' });
  });

  it("should fall back to the next planned chapter's volume when no earlier chapter has one", async () => {
    const briefs = [
      { chapter: 2, body: 'The clerk lies.', volumeKey: null },
      { chapter: 3, body: 'The toll doubles.', volumeKey: 'volume_3' },
    ];
    const { databaseService, insertedBriefs } = fakeDatabase([], briefs);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 2, { briefOrigin: 'hand', briefBody: 'Ada checks the ledger.' });

    expect(insertedBriefs[0]).toMatchObject({ chapter: 3, volumeKey: 'volume_3' });
  });

  it('should leave the new chapter without a volume when no planned chapter has one', async () => {
    const { databaseService, insertedBriefs } = fakeDatabase([], [{ chapter: 2, body: 'The clerk lies.', volumeKey: null }]);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 2, { briefOrigin: 'hand', briefBody: 'Ada checks the ledger.' });

    expect(insertedBriefs[0]).toMatchObject({ chapter: 3, volumeKey: null });
  });
});
