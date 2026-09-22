import { describe, expect, it, mock } from 'bun:test';

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

describe('RetrievalService — unrestricted project', () => {
  it('searchProse still embeds for unrestricted projects', async () => {
    const embedSpy = mock(async () => [0.1, 0.2]);
    const mockDb = { execute: mock(async () => []) };
    const mockDatabaseService = { getPostgresClient: () => mockDb } as never;
    const mockEmbeddingService = { embed: embedSpy } as never as EmbeddingService;

    const retrieval = new RetrievalService(mockDatabaseService, mockEmbeddingService);
    await retrieval.searchProse(BigInt(1), 'test query');

    expect(embedSpy).toHaveBeenCalled();
  });

  it('searchLore still embeds for unrestricted projects', async () => {
    const embedSpy = mock(async () => [0.1, 0.2]);
    const mockDb = { execute: mock(async () => []) };
    const mockDatabaseService = { getPostgresClient: () => mockDb } as never;
    const mockEmbeddingService = { embed: embedSpy } as never as EmbeddingService;

    const retrieval = new RetrievalService(mockDatabaseService, mockEmbeddingService);
    await retrieval.searchLore(BigInt(1), 'test query');

    expect(embedSpy).toHaveBeenCalled();
  });
});
