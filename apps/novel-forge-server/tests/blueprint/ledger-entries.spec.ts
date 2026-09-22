import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { filterLedgerEntries, mergeLedgerLinks, shiftLedgerBriefLinks, shiftLinkedBriefChapters } from '@modules/blueprint/ledger/ledger-entries';
import { type Ledger } from '@server/database';

type Row = Pick<Ledger.Entry, 'kind' | 'phase' | 'topic'> & { name: string };

const rows: Row[] = [
  { name: 'premise', kind: 'decision', phase: 'idea', topic: 'premise' },
  { name: 'taste', kind: 'direction', phase: 'idea', topic: 'taste' },
  { name: 'rules', kind: 'decision', phase: 'world', topic: 'world.rules' },
  { name: 'power', kind: 'rejected', phase: 'world', topic: 'world.power' },
  { name: 'check', kind: 'decision', phase: 'opening', topic: 'check.pacing' },
  { name: 'gate', kind: 'system', phase: null, topic: 'gate' },
];

const names = (entries: Row[]): string[] => entries.map(entry => entry.name);

describe('filterLedgerEntries', () => {
  it('should keep every entry without a filter', () => {
    expect(names(filterLedgerEntries(rows))).toEqual(names(rows));
  });

  it('should combine kind, phase and topic filters', () => {
    expect(names(filterLedgerEntries(rows, { kinds: ['decision'], phases: ['world', 'opening'] }))).toEqual(['rules', 'check']);
    expect(names(filterLedgerEntries(rows, { kinds: ['decision', 'rejected'], topics: ['world.*'] }))).toEqual(['rules', 'power']);
  });

  it('should match a topic prefix only below the dot', () => {
    expect(names(filterLedgerEntries(rows, { topics: ['check.*', 'premise'] }))).toEqual(['premise', 'check']);
    expect(names(filterLedgerEntries(rows, { topics: ['world'] }))).toEqual([]);
  });

  it('should drop unphased entries when phases are filtered', () => {
    expect(names(filterLedgerEntries(rows, { kinds: ['system'], phases: ['idea'] }))).toEqual([]);
    expect(names(filterLedgerEntries(rows, { kinds: ['system'], phases: [] }))).toEqual(['gate']);
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
        arcKeys: ['arc_1'],
        briefChapters: [2, 4],
      },
    );

    expect(merged).toEqual({
      entityKeys: ['keeper', 'clerk'],
      arcKeys: ['arc_1'],
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
    expect(shiftLinkedBriefChapters({ arcKeys: ['arc_1'], briefChapters: [1, 3, 4] }, 3)).toEqual({ arcKeys: ['arc_1'], briefChapters: [1, 3, 5] });
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
      { id: 2n, links: { arcKeys: ['arc_1'], briefChapters: [4, 6] } },
    ]);

    await shiftLedgerBriefLinks(tx as never, 7n, 3);

    expect(lock).toHaveBeenCalledWith('update');
    expect(updates).toEqual([{ links: { arcKeys: ['arc_1'], briefChapters: [5, 7] } }]);
  });

  it('should shift superseded and withdrawn entries too, so their history keeps pointing at the right briefs', async () => {
    const { tx, filters } = fakeTx([]);

    await shiftLedgerBriefLinks(tx as never, 7n, 3);

    const where = new PgDialect().sqlToQuery(filters[0] as SQL).sql;
    expect(where).toContain('briefChapters');
    expect(where).not.toContain('superseded_at');
  });
});
