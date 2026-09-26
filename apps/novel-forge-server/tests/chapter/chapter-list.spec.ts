import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { ChapterService } from '@modules/chapter/chapter.service';
import { type ListChaptersQuery } from '@modules/chapter/chapter.dto';

import { queryRows } from '../sql-filter';

type FindManyQuery = NonNullable<Parameters<typeof queryRows>[1]>;

function chapter(number: number, overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(number),
    projectId: 1n,
    number,
    title: `Chapter ${number}`,
    content: `Body of chapter ${number}`,
    status: 'done',
    volumeKey: null,
    isolated: false,
    locked: false,
    createdAt: new Date(2024, 0, number),
    updatedAt: new Date(2024, 0, number),
    ...overrides,
  };
}

function brief(chapter: number, pov: string | null, scenes: { pov: string | null }[] = []) {
  return { projectId: 1n, chapter, pov, scenes };
}

function thread(threadKey: string, overrides: Record<string, unknown> = {}) {
  return { projectId: 1n, threadKey, openedChapter: null, closedChapter: null, lastAdvancedChapter: null, ...overrides };
}

function fakeDatabase(chapters: ReturnType<typeof chapter>[], briefs: ReturnType<typeof brief>[] = [], threads: ReturnType<typeof thread>[] = []) {
  return {
    query: {
      chapters: {
        findMany: async (query: FindManyQuery & { limit?: number; offset?: number }) => {
          const rows = queryRows(chapters, query);
          const offset = query.offset ?? 0;
          const limit = query.limit ?? rows.length;
          return rows.slice(offset, offset + limit);
        },
        findFirst: async (query: FindManyQuery) => queryRows(chapters, query)[0],
      },
      briefs: { findMany: async (query: FindManyQuery) => queryRows(briefs, query) },
      plotThreads: { findFirst: async (query: FindManyQuery) => queryRows(threads, query)[0] },
    },
    $count: async (table: unknown, where: SQL | undefined) => queryRows(chapters, { where }).length,
  };
}

function query(overrides: Partial<ListChaptersQuery> = {}): ListChaptersQuery {
  return { limit: 25, offset: 0, sortBy: 'number', sortOrder: 'desc', ...overrides } as ListChaptersQuery;
}

function service(db: ReturnType<typeof fakeDatabase>) {
  const databaseService = {
    getPostgresClient: () => db,
    translateError: (err: unknown) => {
      throw err;
    },
  } as never;
  return new ChapterService(databaseService);
}

describe('ChapterService.list', () => {
  it('should sort newest chapter first by default', async () => {
    const chapters = [chapter(1), chapter(2), chapter(3)];
    const result = await service(fakeDatabase(chapters)).list(1n, query());
    expect(result.items.map(item => item.number)).toEqual([3, 2, 1]);
    expect(result.total).toBe(3);
  });

  it('should filter by volume', async () => {
    const chapters = [chapter(1, { volumeKey: 'v1' }), chapter(2, { volumeKey: 'v2' }), chapter(3, { volumeKey: 'v1' })];
    const result = await service(fakeDatabase(chapters)).list(1n, query({ volumeKey: 'v1' }));
    expect(result.items.map(item => item.number)).toEqual([3, 1]);
  });

  it('should filter by pov, matching either the brief pov or a pooled scene pov', async () => {
    const chapters = [chapter(1), chapter(2), chapter(3)];
    const briefs = [brief(1, 'mara'), brief(2, 'ren', [{ pov: 'mara' }]), brief(3, 'ren')];
    const result = await service(fakeDatabase(chapters, briefs)).list(1n, query({ pov: 'mara' }));
    expect(result.items.map(item => item.number)).toEqual([2, 1]);
  });

  it('should filter by thread, matching opened/closed/last-advanced chapters', async () => {
    const chapters = [chapter(1), chapter(2), chapter(3), chapter(4)];
    const threads = [thread('lamp', { openedChapter: 1, closedChapter: 4, lastAdvancedChapter: 2 })];
    const result = await service(fakeDatabase(chapters, [], threads)).list(1n, query({ thread: 'lamp' }));
    expect(result.items.map(item => item.number)).toEqual([4, 2, 1]);
  });

  it('should compose volume, pov and thread filters together', async () => {
    const chapters = [chapter(1, { volumeKey: 'v1' }), chapter(2, { volumeKey: 'v1' }), chapter(3, { volumeKey: 'v2' })];
    const briefs = [brief(1, 'mara'), brief(2, 'mara'), brief(3, 'mara')];
    const threads = [thread('lamp', { openedChapter: 1, lastAdvancedChapter: 2 })];
    const result = await service(fakeDatabase(chapters, briefs, threads)).list(1n, query({ volumeKey: 'v1', pov: 'mara', thread: 'lamp' }));
    expect(result.items.map(item => item.number)).toEqual([2, 1]);
  });

  it('should return an empty page when composed filters match nothing', async () => {
    const chapters = [chapter(1), chapter(2)];
    const briefs = [brief(1, 'mara')];
    const threads = [thread('lamp', { openedChapter: 2 })];
    const result = await service(fakeDatabase(chapters, briefs, threads)).list(1n, query({ pov: 'mara', thread: 'lamp' }));
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('should still list an isolated chapter, flagged, since the chapters screen is author-only', async () => {
    const chapters = [chapter(1), chapter(2, { isolated: true }), chapter(3)];
    const result = await service(fakeDatabase(chapters)).list(1n, query());
    const isolatedRow = result.items.find(item => item.number === 2);
    expect(isolatedRow?.isolated).toBe(true);
  });

  it('should return the page containing the requested chapter for "go to chapter"', async () => {
    const chapters = Array.from({ length: 60 }, (_, i) => chapter(i + 1));
    const result = await service(fakeDatabase(chapters)).list(1n, query({ goto: 30, limit: 25, offset: 999 }));
    // Newest-first order: chapters 60..1. Chapter 30 sits at 0-indexed position 30 (60-30), page = floor(30/25)+1 = 2.
    expect(result.page).toBe(2);
    expect(result.items.map(item => item.number)).toContain(30);
  });

  it('should refuse "go to chapter" for a chapter the filters leave out, rather than return a page without it', async () => {
    const chapters = Array.from({ length: 10 }, (_, i) => chapter(i + 1, { volumeKey: i < 5 ? 'volume_1' : 'volume_2' }));
    const list = service(fakeDatabase(chapters)).list(1n, query({ goto: 3, volumeKey: 'volume_2' }));
    await expect(list).rejects.toMatchObject({ code: 'CHP_001' });
  });

  it('should refuse "go to chapter" for a chapter that does not exist', async () => {
    const chapters = Array.from({ length: 10 }, (_, i) => chapter(i + 1));
    await expect(service(fakeDatabase(chapters)).list(1n, query({ goto: 42 }))).rejects.toMatchObject({ code: 'CHP_001' });
  });

  it('should compute total pages from the filtered total', async () => {
    const chapters = Array.from({ length: 60 }, (_, i) => chapter(i + 1));
    const result = await service(fakeDatabase(chapters)).list(1n, query({ limit: 25 }));
    expect(result.totalPages).toBe(3);
  });
});
