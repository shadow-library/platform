import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { type EmbeddingService, UNTAGGED_EMBEDDING_TASK } from '@modules/ai/retrieval/embedding.service';
import { IndexingService } from '@modules/ai/retrieval/indexing.service';

type Vector = number[] | null;

interface IndexedRow {
  chapter: number;
  embedding: Vector;
  embeddingTask: string | null;
}

interface IndexingFakeOptions {
  embed?: (text: string) => Vector;
  chunkCounts?: { chapter: number; cnt: number; unembedded: number }[];
  chapters?: { number: number; content: string; isolated: boolean }[];
  task?: string;
}

function makeIndexing(options: IndexingFakeOptions = {}) {
  const inserted: IndexedRow[] = [];
  const upserts: { values: Record<string, unknown>; set: Record<string, unknown> }[] = [];
  const queries: SQL[] = [];
  const db = {
    query: { chapters: { findMany: async () => options.chapters ?? [] } },
    execute: async (query: SQL) => {
      queries.push(query);
      return options.chunkCounts ?? [];
    },
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: (rows: IndexedRow[] | Record<string, unknown>) =>
        Object.assign(Promise.resolve(Array.isArray(rows) ? void inserted.push(...rows) : undefined), {
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => void upserts.push({ values: rows as Record<string, unknown>, set }),
        }),
    }),
  };
  const embed = options.embed ?? (() => [0.1, 0.2]);
  const embeddingService = {
    task: options.task ?? 'novel-forge.embedding',
    embed: async (_projectId: bigint, text: string) => embed(text),
    embedBatch: async (_projectId: bigint, texts: string[]) => texts.map(embed),
  } as unknown as EmbeddingService;
  return { indexing: new IndexingService({ getPostgresClient: () => db } as never, embeddingService), inserted, upserts, queries };
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

describe('IndexingService embedding task', () => {
  it('should record the task on every embedded chunk and none on a chunk left unembedded', async () => {
    const paragraphs = ['First paragraph. '.repeat(80), 'Second paragraph. '.repeat(80)];
    const { indexing, inserted } = makeIndexing({ embed: text => (text.startsWith('First') ? [0.1, 0.2] : null), task: 'novel-forge.embedding-v2' });

    await indexing.addProse(1n, 4, paragraphs.join('\n\n'), false);

    expect(inserted.map(row => row.embeddingTask)).toEqual(['novel-forge.embedding-v2', null]);
  });

  it('should store a lore vector with its task, on insert and on update alike, and clear the task with the vector', async () => {
    const embedded = makeIndexing();
    await embedded.indexing.addLore(1n, 'bible_doc', 'world/harbour', 'The harbour.', new Date(0));
    const failed = makeIndexing({ embed: () => null });
    await failed.indexing.addLore(1n, 'bible_doc', 'world/harbour', 'The harbour.', new Date(0));

    expect(embedded.upserts[0]?.values).toMatchObject({ embedding: [0.1, 0.2], embeddingTask: 'novel-forge.embedding' });
    expect(embedded.upserts[0]?.set).toMatchObject({ embedding: [0.1, 0.2], embeddingTask: 'novel-forge.embedding' });
    expect(failed.upserts[0]?.set).toMatchObject({ embedding: null, embeddingTask: null });
  });

  it('should count a chunk embedded by another task as stale, reading an untagged chunk as the first pinned task', async () => {
    const { indexing, queries } = makeIndexing({ task: 'novel-forge.embedding-v2' });

    await indexing.backfill(1n);

    const rendered = new PgDialect().sqlToQuery(queries[0] as SQL);
    expect(rendered.sql).toContain('embedding IS NULL OR NOT coalesce(embedding_task, $1) = $2');
    expect(rendered.params.slice(0, 2)).toEqual([UNTAGGED_EMBEDDING_TASK, 'novel-forge.embedding-v2']);
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
