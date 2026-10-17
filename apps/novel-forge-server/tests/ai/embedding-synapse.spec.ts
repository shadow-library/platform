import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';
import { type SynapseResponseBlock } from '@shadow-library/synapse';

import { EMBEDDING_DIM } from '@server/database';

import { EmbeddingService, UNTAGGED_EMBEDDING_TASK } from '@modules/ai/retrieval/embedding.service';

import { FakeSynapse, json, SYNAPSE_BLOCK, synapseError } from './synapse-fakes';

const EMBEDDING_BLOCK: SynapseResponseBlock = {
  ...SYNAPSE_BLOCK,
  task: 'novel-forge.embedding',
  model: 'qwen3-embedding:0.6b',
  provider: 'local',
  effort: null,
  cost: { list_usd: 0, billed_usd: 0 },
  dimensions: EMBEDDING_DIM,
};

const vector = (seed: number, width = EMBEDDING_DIM): number[] => Array.from({ length: width }, () => seed);

const embeddings = (vectors: number[][], block: Partial<SynapseResponseBlock> = EMBEDDING_BLOCK) =>
  json({ object: 'list', data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })), model: 'novel-forge.embedding', synapse: block });

interface Harness {
  embedding: EmbeddingService;
  synapse: FakeSynapse;
  logged: string[];
}

function harness(owner: { ownerKind: string; ownerId: bigint | null } = { ownerKind: 'user', ownerId: 42n }): Harness {
  const logged: string[] = [];
  const db = { query: { projects: { findFirst: async () => owner } } };
  const synapse = new FakeSynapse();
  const embedding = new EmbeddingService({ getPostgresClient: () => db } as never, synapse.client);
  const log = (level: string) => (message: string) => void logged.push(`${level}: ${message}`);
  (embedding as unknown as Record<string, unknown>)['logger'] = { warn: log('warn'), error: log('error') };
  return { embedding, synapse, logged };
}

describe('EmbeddingService on the synapse backend', () => {
  let restore: RestoreConfig;

  beforeEach(() => {
    restore = setConfig({ 'ai.backend': 'synapse', 'ai.llm.timeout-ms': 60_000 });
  });

  afterEach(() => restore());

  it('should embed a batch in one call to the pinned task, for the owner and with no selectors', async () => {
    const h = harness();
    h.synapse.reply(embeddings([vector(1), vector(2)]));

    expect(await h.embedding.embedBatch(7n, ['first chunk', 'second chunk'])).toEqual([vector(1), vector(2)]);
    expect(h.synapse.requests).toHaveLength(1);
    expect(h.synapse.requests[0]?.url).toBe('http://synapse-server.synapse/api/v1/embeddings');
    expect(h.synapse.requests[0]?.body).toMatchObject({
      model: 'novel-forge.embedding',
      input: ['first chunk', 'second chunk'],
      synapse: { subject: { type: 'owner', id: 'user:42' } },
    });
    expect(h.synapse.requests[0]?.body?.synapse).not.toHaveProperty('selectors');
  });

  it('should send one text as a single input, spending the budget of an unowned project on the shared subject', async () => {
    const h = harness({ ownerKind: 'user', ownerId: null });
    h.synapse.reply(embeddings([vector(3)]));

    expect(await h.embedding.embed(7n, 'a query')).toEqual(vector(3));
    expect(h.synapse.requests[0]?.body).toMatchObject({ input: 'a query', synapse: { subject: { type: 'owner', id: 'unowned' } } });
  });

  it('should place each vector by its index, whatever order Synapse lists them in', async () => {
    const h = harness();
    const data = [
      { object: 'embedding', index: 1, embedding: vector(2) },
      { object: 'embedding', index: 0, embedding: vector(1) },
    ];
    h.synapse.reply(json({ object: 'list', data, model: 'novel-forge.embedding', synapse: EMBEDDING_BLOCK }));

    expect(await h.embedding.embedBatch(7n, ['first', 'second'])).toEqual([vector(1), vector(2)]);
  });

  it('should store no vector when Synapse reports a width the vector columns cannot hold', async () => {
    const h = harness();
    h.synapse.reply(embeddings([vector(1, 4096), vector(2, 4096)], { ...EMBEDDING_BLOCK, dimensions: 4096 }));

    expect(await h.embedding.embedBatch(7n, ['first', 'second'])).toEqual([null, null]);
    expect(h.logged).toEqual(['error: Embeddings do not fit the vector columns, so none is stored']);
  });

  it('should store no vector that misfits the columns even when Synapse reports no width', async () => {
    const h = harness();
    h.synapse.reply(embeddings([vector(1), vector(2, 8)], { ...EMBEDDING_BLOCK, dimensions: undefined }));

    expect(await h.embedding.embedBatch(7n, ['first', 'second'])).toEqual([null, null]);
    expect(h.logged).toEqual(['error: Embeddings do not fit the vector columns, so none is stored']);
  });

  it('should answer null for every text when Synapse answers fewer vectors than it was sent', async () => {
    const h = harness();
    h.synapse.reply(embeddings([vector(1)]));

    expect(await h.embedding.embedBatch(7n, ['first', 'second'])).toEqual([null, null]);
  });

  it('should answer null rather than throw when a Synapse budget refuses the call', async () => {
    const h = harness();
    h.synapse.reply(synapseError(429, 'SYN_BUDGET_CALLS'));

    expect(await h.embedding.embed(7n, 'a query')).toBeNull();
    expect(h.logged).toEqual(['warn: Embedding through Synapse failed']);
  });

  it('should make no call for no texts', async () => {
    const h = harness();

    expect(await h.embedding.embedBatch(7n, [])).toEqual([]);
    expect(h.synapse.requests).toEqual([]);
  });

  it('should name the pinned task as the vector space it embeds into', () => {
    expect(harness().embedding.task).toBe('novel-forge.embedding');
  });
});

describe('EmbeddingService on the legacy backend', () => {
  let restore: RestoreConfig;

  beforeEach(() => {
    restore = setConfig({ 'ai.backend': 'legacy', 'ai.embedding.model': 'qwen3-embedding:0.6b' });
  });

  afterEach(() => restore());

  it('should embed each text through the local Ollama and never call Synapse', async () => {
    const h = harness();
    const prompts: string[] = [];
    (h.embedding as unknown as Record<string, unknown>)['ollama'] = {
      embeddings: async ({ prompt }: { prompt: string }) => {
        prompts.push(prompt);
        return { embedding: vector(prompts.length) };
      },
    };

    expect(await h.embedding.embedBatch(7n, ['first', 'second'])).toEqual([vector(1), vector(2)]);
    expect(prompts).toEqual(['first', 'second']);
    expect(h.synapse.requests).toEqual([]);
  });

  it('should compare its vectors with the rows stored before tasks were recorded', () => {
    expect(harness().embedding.task).toBe(UNTAGGED_EMBEDDING_TASK);
  });
});
