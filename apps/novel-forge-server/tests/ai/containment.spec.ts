import { describe, expect, it, mock } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { type EmbeddingService } from '@modules/ai/retrieval/embedding.service';
import { IndexingService } from '@modules/ai/retrieval/indexing.service';
import { RetrievalService } from '@modules/ai/retrieval/retrieval.service';

interface ChapterRow {
  number: number;
  content: string | null;
  generator: string;
  isolated: boolean;
}

function makeIndexing(chapters: ChapterRow[] = []): { indexing: IndexingService; insertedChapters: number[] } {
  const insertedChapters: number[] = [];
  const db = {
    query: { chapters: { findMany: mock(async () => chapters) } },
    execute: mock(async () => []),
    delete: mock(() => ({ where: mock(async () => undefined) })),
    insert: mock(() => ({
      values: mock(async (rows: { chapter: number }[]) => {
        const chapter = rows[0]?.chapter;
        if (chapter !== undefined) insertedChapters.push(chapter);
      }),
    })),
  };
  const databaseService = { getPostgresClient: () => db } as never;
  const embeddingService = { embedBatch: mock(async (texts: string[]) => texts.map(() => [0.1, 0.2])) } as unknown as EmbeddingService;
  return { indexing: new IndexingService(databaseService, embeddingService), insertedChapters };
}

describe('IndexingService.addProse — containment keys on isolated, not provenance', () => {
  it('should skip a human-written chapter that is isolated', async () => {
    const { indexing, insertedChapters } = makeIndexing();
    await indexing.addProse(1n, 7, 'explicit prose', true);
    expect(insertedChapters).toEqual([]);
  });

  it('should index a human-written chapter that is not isolated', async () => {
    const { indexing, insertedChapters } = makeIndexing();
    await indexing.addProse(1n, 7, 'imported prose', false);
    expect(insertedChapters).toEqual([7]);
  });

  it('should index an unrestricted-provenance chapter that is not isolated', async () => {
    const { indexing, insertedChapters } = makeIndexing();
    await indexing.addProse(1n, 8, 'prose', false);
    expect(insertedChapters).toEqual([8]);
  });
});

describe('IndexingService.backfill', () => {
  it('should index non-isolated chapters of every provenance and skip isolated ones', async () => {
    const { indexing, insertedChapters } = makeIndexing([
      { number: 1, content: 'novel-import final mode', generator: 'human', isolated: false },
      { number: 2, content: 'pasted explicit prose', generator: 'human', isolated: true },
      { number: 3, content: 'model prose', generator: 'unrestricted', isolated: false },
      { number: 4, content: 'contained prose', generator: 'unrestricted', isolated: true },
    ]);

    const result = await indexing.backfill(1n);

    expect(insertedChapters).toEqual([1, 3]);
    expect(result.indexed).toBe(2);
  });
});

describe('RetrievalService.searchProse', () => {
  it('should filter the prose index on isolated rather than on generator', async () => {
    let captured: SQL | undefined;
    const db = {
      execute: mock(async (query: SQL) => {
        captured = query;
        return [];
      }),
    };
    const databaseService = { getPostgresClient: () => db } as never;
    const embeddingService = { embed: mock(async () => [0.1, 0.2]) } as unknown as EmbeddingService;

    await new RetrievalService(databaseService, embeddingService).searchProse(1n, 'query');

    expect(captured).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(captured as SQL).sql;
    expect(rendered).toContain('ch.isolated = false');
    expect(rendered).not.toContain('generator');
  });
});
