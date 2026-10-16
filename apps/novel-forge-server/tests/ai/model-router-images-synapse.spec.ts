import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';
import { type SynapseResponseBlock } from '@shadow-library/synapse';

import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { MODEL_MAP } from '@modules/ai/models';

import { FakeSynapse, hang, json, SYNAPSE_BLOCK, synapseError } from './synapse-fakes';

type Row = Record<string, unknown>;

const OWNED: ProjectConfig = { ownerKind: 'user', ownerId: 42n, contentMode: 'standard', costTier: 'performant' };
const CTX = { projectId: 7n, runId: 'run-1', node: 'generate', promptKey: 'illustration-compose', promptVersion: '1.0.0', role: 'image' };
const PNG = Buffer.from('png-bytes').toString('base64');

const IMAGE_BLOCK: SynapseResponseBlock = {
  ...SYNAPSE_BLOCK,
  task: 'novel-forge.image',
  model: 'grok-imagine-image-2.0',
  label: 'Grok Imagine',
  effort: null,
  cost: { list_usd: 0.07, billed_usd: 0.07 },
};

const generated = (data: Record<string, unknown>[] = [{ b64_json: PNG, media_type: 'image/webp' }]) => json({ data, usage: { cost: 0.07 }, synapse: IMAGE_BLOCK });

interface Harness {
  router: ModelRouterService;
  synapse: FakeSynapse;
  rows: Row[];
  quotaChecks: bigint[];
}

function harness(): Harness {
  const rows: Row[] = [];
  const quotaChecks: bigint[] = [];
  const db = { insert: () => ({ values: async (row: Row) => void rows.push(row) }) };
  const quota = { enforce: async (projectId: bigint) => void quotaChecks.push(projectId) } as never;
  const synapse = new FakeSynapse();
  const router = new ModelRouterService({} as never, { getPostgresClient: () => db } as never, quota, synapse.client);
  (router as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, warn: () => undefined, error: () => undefined };
  return { router, synapse, rows, quotaChecks };
}

describe('ModelRouterService.images on the synapse backend', () => {
  let restore: RestoreConfig;

  beforeEach(() => {
    restore = setConfig({ 'ai.backend': 'synapse', 'ai.llm.max-retries': 2, 'ai.llm.backoff-ms': 0, 'ai.llm.timeout-ms': 60_000 });
  });

  afterEach(() => restore());

  it("should send the image task with the prompt, count and references, for the owner and on the route's selectors", async () => {
    const h = harness();
    h.synapse.reply(generated());
    await h.router.images({ prompt: 'a lone tower', n: 2, inputReferences: ['data:image/png;base64,eA=='] }, CTX, OWNED);

    expect(h.synapse.requests[0]?.url).toBe('http://synapse-server/api/v1/images/generations');
    expect(h.synapse.requests[0]?.body).toMatchObject({
      model: 'novel-forge.image',
      prompt: 'a lone tower',
      n: 2,
      reference_images: ['data:image/png;base64,eA=='],
      synapse: { subject: { type: 'owner', id: 'user:42' }, selectors: { tier: 'performant', content_mode: 'standard' } },
    });
  });

  it('should send no reference images when the request has none', async () => {
    const h = harness();
    h.synapse.reply(generated());
    await h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED);

    expect(h.synapse.requests[0]?.body).not.toHaveProperty('reference_images');
  });

  it('should answer the decoded bytes with their media type, defaulting to png', async () => {
    const h = harness();
    h.synapse.reply(
      generated([
        { b64_json: PNG, media_type: 'image/webp' },
        { b64_json: PNG, media_type: '' },
      ]),
    );
    const images = await h.router.images({ prompt: 'a lone tower', n: 2 }, CTX, OWNED);

    expect(images.map(image => image.contentType)).toEqual(['image/webp', 'image/png']);
    expect(Buffer.from(images[0]?.bytes ?? []).toString()).toBe('png-bytes');
  });

  it('should record the model that answered with its list cost and where that figure came from', async () => {
    const h = harness();
    h.synapse.reply(generated());
    await h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED);

    expect(h.rows).toEqual([
      expect.objectContaining({
        projectId: 7n,
        runId: 'run-1',
        role: 'image',
        provider: 'openrouter',
        model: 'grok-imagine-image-2.0',
        status: 'ok',
        costUsd: '0.07',
        costSource: 'provider',
        tier: 'performant',
        contentMode: 'standard',
        attempt: 0,
      }),
    ]);
  });

  it('should leave the spend guard to Synapse and need no OpenRouter key', async () => {
    const h = harness();
    h.synapse.reply(generated());

    expect(await h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED)).toHaveLength(1);
    expect(h.quotaChecks).toEqual([]);
  });

  it('should keep the local quota guard and the OpenRouter key on the legacy backend', async () => {
    const h = harness();
    const restoreLegacy = setConfig({ 'ai.backend': 'legacy', 'ai.openrouter.api.key': undefined });
    try {
      await expect(h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_004' });
      expect(h.quotaChecks).toEqual([7n]);
      expect(h.synapse.requests).toEqual([]);
    } finally {
      restoreLegacy();
    }
  });

  it("should refuse more references than the registry's image model takes before any request", async () => {
    const h = harness();
    const capacity = MODEL_MAP[h.router.resolveModel('image', OWNED).model]?.maxInputReferences ?? 0;
    const references = Array.from({ length: capacity + 1 }, (_, i) => `data:image/png;base64,${i}`);

    await expect(h.router.images({ prompt: 'a lone tower', n: 1, inputReferences: references }, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_010' });
    expect(h.synapse.requests).toEqual([]);
  });

  it('should make one call and give up with AI_005 on a failure Synapse could not fail over, recording it against the task', async () => {
    const h = harness();
    h.synapse.reply(synapseError(503, 'SYN_PROVIDERS_EXHAUSTED'), generated());

    await expect(h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_005' });
    expect(h.synapse.requests).toHaveLength(1);
    expect(h.rows).toEqual([
      expect.objectContaining({
        provider: 'synapse',
        model: 'novel-forge.image',
        status: 'transport_error',
        costUsd: null,
        error: expect.objectContaining({ code: 'SYN_PROVIDERS_EXHAUSTED' }),
      }),
    ]);
  });

  it('should surface a Synapse budget as the rate limit the author already knows, recorded as refused', async () => {
    const h = harness();
    h.synapse.reply(synapseError(429, 'SYN_BUDGET_CALLS'));

    await expect(h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_008' });
    expect(h.rows[0]).toMatchObject({ status: 'refused', error: { code: 'SYN_BUDGET_CALLS' } });
  });

  it('should fail AI_005 when Synapse answers no image, keeping what the call cost', async () => {
    const h = harness();
    h.synapse.reply(generated([]));

    await expect(h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_005' });
    expect(h.rows[0]).toMatchObject({ status: 'transport_error', model: 'grok-imagine-image-2.0', costUsd: '0.07' });
  });

  it('should abort the request when the run is cancelled', async () => {
    const h = harness();
    h.synapse.reply(hang);
    h.router.bindRunSignal('run-1');
    const sent = h.synapse.sent();
    const call = h.router.images({ prompt: 'a lone tower', n: 1 }, CTX, OWNED);
    await sent;
    h.router.abortRun('run-1');

    await expect(call).rejects.toMatchObject({ code: 'AI_013' });
    expect(h.synapse.requests[0]?.signal?.aborted).toBe(true);
  });
});
