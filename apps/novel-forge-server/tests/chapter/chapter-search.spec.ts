import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { buildSnippet, ChapterSearchService } from '@modules/chapter/chapter-search.service';
import { type SearchChaptersQuery } from '@modules/chapter/chapter.dto';

const dialect = new PgDialect();

function query(overrides: Partial<SearchChaptersQuery> = {}): SearchChaptersQuery {
  return { q: 'lamp', limit: 25, offset: 0, ...overrides } as SearchChaptersQuery;
}

function fakeService(execute: (renderedSql: string) => unknown[]) {
  const db = { execute: mock(async (sqlObj: SQL) => execute(dialect.sqlToQuery(sqlObj).sql)) };
  const databaseService = { getPostgresClient: () => db } as never;
  return { service: new ChapterSearchService(databaseService), db };
}

describe('buildSnippet', () => {
  it('should count every case-insensitive occurrence of the query', () => {
    const { matchCount } = buildSnippet('The Lamp lit the room. Another lamp stood cold.', 'lamp');
    expect(matchCount).toBe(2);
  });

  it('should build a snippet around the first match with ellipses on both sides when truncated', () => {
    const body = `${'x'.repeat(200)} the lamp burned bright ${'y'.repeat(200)}`;
    const { snippet } = buildSnippet(body, 'lamp');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.toLowerCase()).toContain('lamp');
  });

  it('should report zero matches and a plain leading excerpt when the query is absent', () => {
    const { matchCount, snippet } = buildSnippet('No mention of the item here.', 'lamp');
    expect(matchCount).toBe(0);
    expect(snippet).toBe('No mention of the item here.');
  });
});

describe('ChapterSearchService.search', () => {
  it('should not touch the database for a blank query', async () => {
    const { service, db } = fakeService(() => []);
    const result = await service.search(1n, query({ q: '   ' }));
    expect(result.items).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('should rank and paginate hits, deriving matchCount and snippet from the fetched prose', async () => {
    const { service } = fakeService(sql => {
      if (sql.includes('count(*)')) return [{ count: 2 }];
      return [
        { number: 5, title: 'The Gate', body: 'She lit the lamp twice, the lamp flared.' },
        { number: 2, title: 'The Lamp', body: 'A single lamp on the table.' },
      ];
    });

    const result = await service.search(1n, query());
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.items[0]).toMatchObject({ number: 5, title: 'The Gate', matchCount: 2 });
    expect(result.items[1]).toMatchObject({ number: 2, title: 'The Lamp', matchCount: 1 });
  });

  it('should exclude isolated chapters and drafts by construction of the query', async () => {
    const renderedQueries: string[] = [];
    const { service } = fakeService(sql => {
      renderedQueries.push(sql);
      return sql.includes('count(*)') ? [{ count: 0 }] : [];
    });

    await service.search(1n, query());

    for (const sql of renderedQueries) {
      expect(sql).toContain('isolated = true');
      expect(sql.toLowerCase()).toContain('not in');
    }
  });

  it('should compose the volume, pov and thread filters into the same query', async () => {
    const renderedQueries: string[] = [];
    const { service } = fakeService(sql => {
      renderedQueries.push(sql);
      return sql.includes('count(*)') ? [{ count: 0 }] : [];
    });

    await service.search(1n, query({ volumeKey: 'v1', pov: 'mara', thread: 'lamp' }));

    for (const sql of renderedQueries) {
      expect(sql).toContain('volume_key');
      expect(sql).toContain('briefs');
      expect(sql).toContain('plot_threads');
    }
  });
});
