import { describe, expect, it, mock } from 'bun:test';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { chunkText } from '@modules/ai/retrieval/chunker';
import { EmbeddingService } from '@modules/ai/retrieval/embedding.service';
import { RetrievalService } from '@modules/ai/retrieval/retrieval.service';

describe('chunkText', () => {
  it('returns at least one chunk for empty input', () => {
    const chunks = chunkText('');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]?.chunkIdx).toBe(0);
  });

  it('returns one chunk with chunkIdx 0 for short text', () => {
    const text = 'A'.repeat(100);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkIdx).toBe(0);
    expect(chunks[0]?.text).toBe(text);
  });

  it('produces 2+ chunks for text spanning multiple paragraphs beyond targetChars', () => {
    // 4 paragraphs, each ~600 chars. Para1+Para2 < 2000, Para1+Para2+Para3 > 2000.
    const para = (n: number) => `Paragraph ${n}: ${'X'.repeat(560)}`;
    const text = [para(1), para(2), para(3), para(4)].join('\n\n');

    const chunks = chunkText(text, 2000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.chunkIdx).toBe(i);
    }
  });

  it('preserves all content — joined chunks roughly equal original', () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Para ${i}: ${'Y'.repeat(400)}`);
    const text = paras.join('\n\n');
    const chunks = chunkText(text, 2000);

    const allText = chunks.map(c => c.text).join('');
    expect(allText.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('RetrievalService — grok_only project', () => {
  it('searchProse returns [] without calling embed for grok_only projects', async () => {
    const embedSpy = mock(async () => [0.1, 0.2]);

    const mockDb = {
      query: {
        projects: {
          findFirst: mock(async () => ({ contentMode: 'grok_only' })),
        },
      },
    };

    const mockDatabaseService = { getPostgresClient: () => mockDb } as never;
    const mockEmbeddingService = { embed: embedSpy } as never as EmbeddingService;

    const retrieval = new RetrievalService(mockDatabaseService, mockEmbeddingService);
    const hits = await retrieval.searchProse(BigInt(1), 'test query');

    expect(hits).toEqual([]);
    expect(embedSpy).not.toHaveBeenCalled();
  });

  it('searchLore returns [] without calling embed for grok_only projects', async () => {
    const embedSpy = mock(async () => [0.1, 0.2]);

    const mockDb = {
      query: {
        projects: {
          findFirst: mock(async () => ({ contentMode: 'grok_only' })),
        },
      },
    };

    const mockDatabaseService = { getPostgresClient: () => mockDb } as never;
    const mockEmbeddingService = { embed: embedSpy } as never as EmbeddingService;

    const retrieval = new RetrievalService(mockDatabaseService, mockEmbeddingService);
    const hits = await retrieval.searchLore(BigInt(1), 'test query');

    expect(hits).toEqual([]);
    expect(embedSpy).not.toHaveBeenCalled();
  });
});

describe.skip('IndexingService.backfill (rung-3, requires PG + Ollama)', () => {
  it('backfills missing chapter chunks and reports indexed/skipped counts', async () => {
    // Full integration test: requires a live Postgres instance and a running Ollama server.
    // Run manually as part of the A10 local-LLM test suite.
  });
});

function makeDbStubForOutline() {
  return {
    query: {
      projects: { findFirst: mock(async () => null) },
      chapters: { findMany: mock(async () => []) },
      volumes: { findFirst: mock(async () => null), findMany: mock(async () => []) },
      contextPacks: { findFirst: mock(async () => null) },
    },
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          returning: mock(async () => []),
        })),
      })),
    })),
  };
}

describe('ContextAssembler.forOutline — no RetrievalService injected', () => {
  it('returns a pack with no prose_retrieved or lore_retrieved sections', async () => {
    const db = makeDbStubForOutline();
    const fakeDatabaseService = { getPostgresClient: () => db } as never;
    const fakeCatalog = { render: mock(async () => '') } as unknown as CatalogService;

    const assembler = new ContextAssembler(fakeDatabaseService, fakeCatalog);
    const pack = await assembler.forOutline(1n, 3, { budgetTokens: 100_000 });

    const sectionKeys = pack.sections.map(s => s.key);
    expect(sectionKeys).not.toContain('prose_retrieved');
    expect(sectionKeys).not.toContain('lore_retrieved');
  });
});
