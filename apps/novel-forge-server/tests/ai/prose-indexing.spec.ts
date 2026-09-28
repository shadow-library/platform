import { describe, expect, it } from 'bun:test';

import { type EmbeddingService } from '@modules/ai/retrieval/embedding.service';
import { IndexingService } from '@modules/ai/retrieval/indexing.service';

type Vector = number[] | null;

interface IndexingFakeOptions {
  embed?: (text: string) => Vector;
  chunkCounts?: { chapter: number; cnt: number; unembedded: number }[];
  chapters?: { number: number; content: string; isolated: boolean }[];
}

function makeIndexing(options: IndexingFakeOptions = {}) {
  const inserted: { chapter: number; embedding: Vector }[] = [];
  const db = {
    query: { chapters: { findMany: async () => options.chapters ?? [] } },
    execute: async () => options.chunkCounts ?? [],
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: async (rows: { chapter: number; embedding: Vector }[]) => {
        inserted.push(...rows);
      },
    }),
  };
  const embed = options.embed ?? (() => [0.1, 0.2]);
  const embeddingService = { embedBatch: async (texts: string[]) => texts.map(embed) } as unknown as EmbeddingService;
  return { indexing: new IndexingService({ getPostgresClient: () => db } as never, embeddingService), inserted };
}

describe('IndexingService.addProse', () => {
  it('should report the chapter indexed when every chunk was embedded', async () => {
    const { indexing } = makeIndexing();

    expect(await indexing.addProse(1n, 4, 'The keeper counts the ships.', false)).toBe(true);
  });

  it('should report the chapter unindexed when no chunk could be embedded', async () => {
    const { indexing } = makeIndexing({ embed: () => null });

    expect(await indexing.addProse(1n, 4, 'The keeper counts the ships.', false)).toBe(false);
  });

  it('should report an isolated chapter unindexed without writing a chunk', async () => {
    const { indexing, inserted } = makeIndexing();

    expect(await indexing.addProse(1n, 4, 'Firewalled prose.', true)).toBe(false);
    expect(inserted).toEqual([]);
  });
});

describe('IndexingService.backfill', () => {
  it('should re-index a chapter whose chunks hold a null embedding and leave a fully embedded one alone', async () => {
    const { indexing, inserted } = makeIndexing({
      chapters: [
        { number: 1, content: 'Prose the embedder failed on.', isolated: false },
        { number: 3, content: 'Prose already embedded.', isolated: false },
      ],
      chunkCounts: [
        { chapter: 1, cnt: 2, unembedded: 2 },
        { chapter: 3, cnt: 2, unembedded: 0 },
      ],
    });

    const result = await indexing.backfill(1n);

    expect([...new Set(inserted.map(row => row.chapter))]).toEqual([1]);
    expect(result).toEqual({ indexed: 1, skipped: 0 });
  });

  it('should count a chapter the embedder still cannot reach as skipped, not indexed', async () => {
    const { indexing } = makeIndexing({ embed: () => null, chapters: [{ number: 2, content: 'Prose.', isolated: false }] });

    expect(await indexing.backfill(1n)).toEqual({ indexed: 0, skipped: 1 });
  });
});
