import { describe, expect, it } from 'bun:test';

import { ChapterInsertService } from '@modules/generation/chapter-insert.service';
import { type Ledger, schema } from '@server/database';

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

function fakeDatabase(ledger: { id: bigint; links: Ledger.Links }[]) {
  const ledgerUpdates: unknown[] = [];
  const none = { findFirst: async () => undefined, findMany: async () => [] };
  const db = {
    query: {
      projects: { findFirst: async () => ({ id: 1n, status: 'active', kind: 'new_novel' }) },
      chapters: none,
      briefs: none,
      jobs: none,
      volumes: none,
      arcs: none,
    },
    select: () => ({ from: (table: unknown) => chain(table === schema.decisionLedgerEntries ? ledger : []) }),
    update: (table: unknown) => chain([], table === schema.decisionLedgerEntries ? values => ledgerUpdates.push(values) : undefined),
    insert: () => chain([{ chapter: 1, body: 'Ada meets the clerk.' }]),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { databaseService: { getPostgresClient: () => db }, ledgerUpdates };
}

describe('ChapterInsertService.insertAfter', () => {
  it('should renumber the brief chapters the decision ledger links to', async () => {
    const { databaseService, ledgerUpdates } = fakeDatabase([{ id: 9n, links: { volumeKeys: ['vol_1'], briefChapters: [1, 2] } }]);
    const service = new ChapterInsertService(databaseService as never, null as never, null as never, null as never);

    await service.insertAfter(1n, 0, { briefOrigin: 'hand', briefBody: 'Ada meets the clerk.' });

    expect(ledgerUpdates).toEqual([{ links: { volumeKeys: ['vol_1'], briefChapters: [2, 3] } }]);
  });
});
