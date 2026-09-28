import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { schema } from '@server/database';

import { PublicationJanitor } from '@modules/jobs/publication.janitor';
import { CANONICAL_PROSE_CHANGED_PREFIX, STALE_ERROR_PREFIX } from '@modules/publishing/publish-runner';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

function chapterRow(overrides: Row = {}): Row {
  return {
    projectId: 1n,
    number: 3,
    title: 'Low Water',
    content: 'The ferry waits.',
    note: null,
    wordCount: 4,
    contentRating: null,
    updatedAt: new Date(2024, 0, 1),
    ...overrides,
  };
}

function publicationRow(overrides: Row = {}): Row {
  return {
    id: 9n,
    projectId: 1n,
    chapter: 3,
    status: 'scheduled',
    error: null,
    contentHash: 'stale-hash',
    crlfRehashSince: new Date(2024, 0, 2),
    ...overrides,
  };
}

function fakeDb(chapterPublications: Row[], chapters: Row[]) {
  const updates: { id: bigint; patch: Row }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async (where: SQL) =>
            chapterPublications
              .filter(row => matchesWhere(row, where))
              .map(row => ({ publication: row, chapter: chapters.find(c => c['projectId'] === row['projectId'] && c['number'] === row['chapter']) })),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Row) => ({
        where: async (cond: SQL) => {
          const target = chapterPublications.find(row => matchesWhere(row, cond));
          if (!target) return;
          updates.push({ id: target['id'] as bigint, patch });
          Object.assign(target, patch);
        },
      }),
    }),
  };
  return { janitor: new PublicationJanitor({ getPostgresClient: () => db } as never, {} as never, {} as never), updates, chapterPublications };
}

describe('PublicationJanitor.reconcileCrlfContentHashes', () => {
  it('should adopt the fresh content hash on a marked row whose chapter was not touched since the mark', async () => {
    const chapter = chapterRow({ updatedAt: new Date(2024, 0, 1) });
    const publication = publicationRow({ crlfRehashSince: new Date(2024, 0, 2) });
    const { janitor, chapterPublications } = fakeDb([publication], [chapter]);

    const adopted = await janitor.reconcileCrlfContentHashes();

    expect(adopted).toBe(1);
    expect(chapterPublications[0]).toMatchObject({ crlfRehashSince: null });
    expect(chapterPublications[0]?.['contentHash']).not.toBe('stale-hash');
  });

  it('should skip a marked row whose chapter was edited after the mark, leaving its hash and error alone', async () => {
    const chapter = chapterRow({ updatedAt: new Date(2024, 0, 3) });
    const publication = publicationRow({
      crlfRehashSince: new Date(2024, 0, 2),
      status: 'failed',
      error: `${CANONICAL_PROSE_CHANGED_PREFIX} since this publish was decided — republish chapter 3`,
    });
    const { janitor, chapterPublications } = fakeDb([publication], [chapter]);

    const adopted = await janitor.reconcileCrlfContentHashes();

    expect(adopted).toBe(0);
    expect(chapterPublications[0]).toMatchObject({ contentHash: 'stale-hash', status: 'failed', crlfRehashSince: null });
  });

  it('should never touch an unmarked row', async () => {
    const chapter = chapterRow();
    const unmarked = publicationRow({ id: 10n, crlfRehashSince: null, contentHash: 'untouched-hash' });
    const marked = publicationRow({ id: 9n, crlfRehashSince: new Date(2024, 0, 2) });
    const { janitor, updates, chapterPublications } = fakeDb([unmarked, marked], [chapter]);

    await janitor.reconcileCrlfContentHashes();

    expect(updates.map(update => update.id)).toEqual([9n]);
    expect(chapterPublications.find(row => row['id'] === 10n)).toMatchObject({ crlfRehashSince: null, contentHash: 'untouched-hash' });
  });

  it("should reset a stale-prose failure back to scheduled when it adopts the row's fresh hash", async () => {
    const chapter = chapterRow({ updatedAt: new Date(2024, 0, 1) });
    const publication = publicationRow({
      status: 'failed',
      error: `${CANONICAL_PROSE_CHANGED_PREFIX} since this publish was decided — republish chapter 3`,
      crlfRehashSince: new Date(2024, 0, 2),
    });
    const { janitor, chapterPublications } = fakeDb([publication], [chapter]);

    await janitor.reconcileCrlfContentHashes();

    expect(chapterPublications[0]).toMatchObject({ status: 'scheduled', error: null });
  });
});

describe('PublicationJanitor.dueProjects', () => {
  function janitorOver(tables: Map<unknown, Row[]>): PublicationJanitor {
    const read = () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          const rows = (tables.get(table) ?? []).filter(row => matchesWhere(row, where));
          const projects = (list: Row[]) => list.map(row => ({ projectId: row['projectId'] }));
          return Object.assign(Promise.resolve(projects(rows)), {
            orderBy: () => ({ limit: async (count: number) => projects([...rows].sort((a, b) => Number(a['id']) - Number(b['id'])).slice(0, count)) }),
          });
        },
      }),
    });
    const db = { select: read, selectDistinct: read };
    return new PublicationJanitor({ getPostgresClient: () => db } as never, {} as never, {} as never);
  }

  function publication(projectId: bigint, overrides: Row = {}): Row {
    return { id: projectId, projectId, accessRevision: 3, accessPushedRevision: 3, accessError: null, ...overrides };
  }

  it('should sweep a publication whose share list changed after the reader last accepted one', async () => {
    const publications = [publication(1n, { accessPushedRevision: 2 }), publication(2n)];
    const janitor = janitorOver(new Map([[schema.publications, publications]]));

    expect(await janitor.dueProjects()).toEqual([1n]);
  });

  it('should sweep a publication whose access never reached the reader', async () => {
    const janitor = janitorOver(new Map([[schema.publications, [publication(1n, { accessPushedRevision: null })]]]));

    expect(await janitor.dueProjects()).toEqual([1n]);
  });

  it('should keep sweeping a trailing access revision after a failure a retry can clear', async () => {
    const publications = [publication(1n, { accessPushedRevision: 2, accessError: 'reader service unreachable: connect ECONNREFUSED' })];
    const janitor = janitorOver(new Map([[schema.publications, publications]]));

    expect(await janitor.dueProjects()).toEqual([1n]);
  });

  it('should leave a stale access conflict for an explicit reconcile', async () => {
    const publications = [publication(1n, { accessPushedRevision: 2, accessError: `${STALE_ERROR_PREFIX} the reader already holds revision unknown` })];
    const janitor = janitorOver(new Map([[schema.publications, publications]]));

    expect(await janitor.dueProjects()).toEqual([]);
  });

  it('should drain a backlog of trailing publications a batch per sweep, lowest id first', async () => {
    const publications = Array.from({ length: 45 }, (_, index) => publication(BigInt(45 - index), { accessPushedRevision: null }));
    const janitor = janitorOver(new Map([[schema.publications, publications]]));

    const due = await janitor.dueProjects();

    expect(due).toEqual(Array.from({ length: 20 }, (_, index) => BigInt(index + 1)));
  });
});
