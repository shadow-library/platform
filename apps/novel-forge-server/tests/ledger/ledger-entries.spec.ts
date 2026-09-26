import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { filterLedgerEntries, mergeLedgerLinks, shiftLedgerBriefLinks, shiftLinkedBriefChapters } from '@modules/ledger/ledger-entries';
import { type Ledger } from '@server/database';

type Row = Pick<Ledger.Entry, 'kind' | 'topic'> & { name: string };

const rows: Row[] = [
  { name: 'premise', kind: 'decision', topic: 'premise' },
  { name: 'taste', kind: 'direction', topic: 'taste' },
  { name: 'rules', kind: 'decision', topic: 'world.rules' },
  { name: 'power', kind: 'rejected', topic: 'world.power' },
  { name: 'organised', kind: 'decision', topic: 'organise.rules' },
  { name: 'detail', kind: 'system', topic: 'cast' },
];

const names = (entries: Row[]): string[] => entries.map(entry => entry.name);

describe('filterLedgerEntries', () => {
  it('should keep every entry without a filter', () => {
    expect(names(filterLedgerEntries(rows))).toEqual(names(rows));
  });

  it('should combine kind and topic filters', () => {
    expect(names(filterLedgerEntries(rows, { kinds: ['decision'] }))).toEqual(['premise', 'rules', 'organised']);
    expect(names(filterLedgerEntries(rows, { kinds: ['decision', 'rejected'], topics: ['world.*'] }))).toEqual(['rules', 'power']);
  });

  it('should match a topic prefix only below the dot', () => {
    expect(names(filterLedgerEntries(rows, { topics: ['organise.*', 'premise'] }))).toEqual(['premise', 'organised']);
    expect(names(filterLedgerEntries(rows, { topics: ['world'] }))).toEqual([]);
  });
});

describe('mergeLedgerLinks', () => {
  it('should union every link list without duplicates and sort brief chapters', () => {
    const merged = mergeLedgerLinks(
      { bibleDocuments: [{ section: 'world', slug: 'tides' }], entityKeys: ['keeper'], briefChapters: [4] },
      {
        bibleDocuments: [
          { section: 'world', slug: 'tides' },
          { section: 'plot', slug: 'spine' },
        ],
        entityKeys: ['keeper', 'clerk'],
        volumeKeys: ['volume_1'],
        briefChapters: [2, 4],
      },
    );

    expect(merged).toEqual({
      entityKeys: ['keeper', 'clerk'],
      volumeKeys: ['volume_1'],
      bibleDocuments: [
        { section: 'world', slug: 'tides' },
        { section: 'plot', slug: 'spine' },
      ],
      briefChapters: [2, 4],
    });
  });

  it('should leave no empty lists behind', () => {
    expect(mergeLedgerLinks({}, { factKeys: [] })).toEqual({});
  });
});

describe('shiftLinkedBriefChapters', () => {
  it('should move only the brief chapters after the insert point', () => {
    expect(shiftLinkedBriefChapters({ volumeKeys: ['volume_1'], briefChapters: [1, 3, 4] }, 3)).toEqual({ volumeKeys: ['volume_1'], briefChapters: [1, 3, 5] });
  });
});

describe('shiftLedgerBriefLinks', () => {
  function fakeTx(rows: { id: bigint; links: Ledger.Links }[]) {
    const lock = mock((mode: string) => Promise.resolve(mode === 'update' ? rows : []));
    const updates: { links: Ledger.Links }[] = [];
    const filters: SQL[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: (filter: SQL) => {
            filters.push(filter);
            return { for: lock };
          },
        }),
      }),
      update: () => ({
        set: (values: { links: Ledger.Links }) => {
          updates.push(values);
          return { where: async () => undefined };
        },
      }),
    };
    return { tx, lock, updates, filters };
  }

  it('should lock the linked rows and rewrite only those whose chapters move', async () => {
    const { tx, lock, updates } = fakeTx([
      { id: 1n, links: { briefChapters: [1, 2] } },
      { id: 2n, links: { volumeKeys: ['volume_1'], briefChapters: [4, 6] } },
    ]);

    await shiftLedgerBriefLinks(tx as never, 7n, 3);

    expect(lock).toHaveBeenCalledWith('update');
    expect(updates).toEqual([{ links: { volumeKeys: ['volume_1'], briefChapters: [5, 7] } }]);
  });

  it('should shift superseded and withdrawn entries too, so their history keeps pointing at the right briefs', async () => {
    const { tx, filters } = fakeTx([]);

    await shiftLedgerBriefLinks(tx as never, 7n, 3);

    const where = new PgDialect().sqlToQuery(filters[0] as SQL).sql;
    expect(where).toContain('briefChapters');
    expect(where).not.toContain('superseded_at');
  });
});
