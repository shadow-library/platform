import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';
import { SynapseChatModel } from '@shadow-library/synapse/langchain';

import { schema } from '@server/database';

import { type AiRole } from '@modules/ai/defaults';
import { GatewayChatOpenAI } from '@modules/ai/gateway-chat-openai';
import { HARD_LINE_SYSTEM_LINE } from '@modules/ai/hard-line';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { type PromptModule } from '@modules/ai/prompts/types';
import { ChatTitleSchema } from '@modules/ai/schemas/chat-title.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';

import { completion, FakeSynapse, hang, json, refuseConnection, stream, SYNAPSE_BLOCK, synapseError } from './synapse-fakes';

type Row = Record<string, unknown>;

const OWNED: ProjectConfig = { ownerKind: 'user', ownerId: 42n, contentMode: 'standard', costTier: 'economy' };
const UNRESTRICTED: ProjectConfig = { ownerKind: 'user', ownerId: 42n, contentMode: 'unrestricted', costTier: 'balanced' };
const CTX = { projectId: 7n, promptKey: 'chat-title', promptVersion: '1.0.0', role: 'title' };
const ANSWER = JSON.stringify({ title: 'Volume two pacing' });

const titlePrompt = (role: AiRole = 'title'): PromptModule<{ title: string }> => ({
  key: 'chat-title',
  version: '1.0.0',
  kind: 'analytical',
  role,
  system: 'Name it.',
  template: { formatMessages: async () => [new SystemMessage('Name it.'), new HumanMessage('Volume 2 pacing?')] } as never,
  schema: ChatTitleSchema,
});

interface Harness {
  router: ModelRouterService;
  synapse: FakeSynapse;
  rows: Row[];
  cacheReads: number;
  quotaChecks: bigint[];
}

const catalogAt = (version: number) => json({ catalog_version: version, task: 'novel-forge.review', default: SYNAPSE_BLOCK, aliases: [], native_web_search: false });

function harness(owner?: { ownerKind: string; ownerId: bigint | null }, catalog = catalogAt(3)): Harness {
  const rows: Row[] = [];
  const quotaChecks: bigint[] = [];
  const db = {
    query: { llmCache: { findFirst: async () => void h.cacheReads++ }, projects: { findFirst: async () => owner } },
    insert: (table: unknown) => ({
      values: (row: Row) =>
        Object.assign(Promise.resolve(void rows.push(table === schema.llmCache ? { ...row, cached: true } : row)), { onConflictDoNothing: async () => undefined }),
    }),
  };
  const databaseService = { getPostgresClient: () => db } as never;
  const synapse = new FakeSynapse().answerCatalog(catalog);
  const quota = { enforce: async (projectId: bigint) => void quotaChecks.push(projectId) } as never;
  const router = new ModelRouterService(new TelemetryHandler(databaseService), databaseService, quota, synapse.client);
  (router as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, warn: () => undefined, error: () => undefined };
  const h: Harness = { router, synapse, rows, cacheReads: 0, quotaChecks };
  return h;
}

const envelopeOf = (h: Harness, index = 0): Record<string, unknown> => h.synapse.requests[index]?.body?.synapse as Record<string, unknown>;

describe('ModelRouterService on the synapse backend', () => {
  let restore: RestoreConfig;

  beforeEach(() => {
    restore = setConfig({ 'ai.backend': 'synapse', 'ai.llm.max-retries': 2, 'ai.llm.backoff-ms': 0, 'ai.llm.timeout-ms': 60_000 });
  });

  afterEach(() => restore());

  describe('the switch', () => {
    it('should build a Synapse chat model and leave the spend guard to Synapse', async () => {
      const h = harness();

      expect(await h.router.chatFor('judge', CTX, OWNED)).toBeInstanceOf(SynapseChatModel);
      expect(h.quotaChecks).toEqual([]);
    });

    it('should keep the legacy client and the local quota guard unless the backend is synapse', async () => {
      const restoreLegacy = setConfig({ 'ai.backend': 'legacy', 'ai.openrouter.api.key': 'key', 'ai.openrouter.api.url': 'https://openrouter.ai/api/v1' });
      try {
        const h = harness();
        expect(await h.router.chatFor('judge', CTX, OWNED)).toBeInstanceOf(GatewayChatOpenAI);
        setConfig({ 'ai.backend': undefined });
        expect(await h.router.chatFor('judge', CTX, OWNED)).toBeInstanceOf(GatewayChatOpenAI);
        expect(h.quotaChecks).toEqual([7n, 7n]);
      } finally {
        restoreLegacy();
      }
    });
  });

  describe('the request', () => {
    const tasks: [AiRole, string][] = [
      ['generation', 'novel-forge.writing'],
      ['plan', 'novel-forge.planning'],
      ['judge', 'novel-forge.review'],
      ['chat', 'novel-forge.chat'],
      ['title', 'novel-forge.helper'],
      ['vision', 'novel-forge.vision'],
    ];

    for (const [role, task] of tasks) {
      it(`should send a ${role} call as ${task} with the owner subject and the route's selectors`, async () => {
        const h = harness();
        h.synapse.reply(json(completion(ANSWER)));
        await h.router.structured(titlePrompt(role), {}, CTX, OWNED);

        expect(h.synapse.requests[0]?.body?.model).toBe(task);
        expect(envelopeOf(h)).toMatchObject({ subject: { type: 'owner', id: 'user:42' }, selectors: { tier: 'economy', content_mode: 'standard' } });
      });
    }

    it('should refuse to make an image or embedding role a chat task', async () => {
      const h = harness();

      expect(() => h.router.buildSynapseClient('image', h.router.routeModel('image', OWNED), { subject: { type: 'owner', id: 'x' } })).toThrow(
        expect.objectContaining({ code: 'AI_002' }),
      );
    });

    it('should look the owner up when the caller passed no project, and share one subject across unowned projects', async () => {
      const owned = harness({ ownerKind: 'bot', ownerId: 9n });
      owned.synapse.reply(json(completion(ANSWER)));
      await owned.router.structured(titlePrompt(), {}, CTX);
      const unowned = harness({ ownerKind: 'user', ownerId: null });
      unowned.synapse.reply(json(completion(ANSWER)));
      await unowned.router.structured(titlePrompt(), {}, CTX);

      expect(envelopeOf(owned).subject).toEqual({ type: 'owner', id: 'bot:9' });
      expect(envelopeOf(unowned).subject).toEqual({ type: 'owner', id: 'unowned' });
    });

    it('should send no effort, always a json_schema response format, and the session and web search the call asked for', async () => {
      const h = harness();
      h.synapse.reply(json(completion(ANSWER)));
      await h.router.structured(titlePrompt('chat'), {}, { ...CTX, role: 'chat', gatewaySession: 'dev:7:chat-1', webTools: true }, { ...OWNED, chatModel: undefined });

      const body = h.synapse.requests[0]?.body ?? {};
      expect(body.reasoning).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'chat-title' } });
      expect(envelopeOf(h)).toMatchObject({ session: 'dev:7:chat-1', web_search: true });
      expect(envelopeOf(h).effort).toBeUndefined();
    });

    it('should mark the stable prefix for prompt caching whatever model the route would pick', async () => {
      const h = harness();
      h.synapse.reply(json(completion(ANSWER)));
      const big = 'canon '.repeat(1500);
      const prompt = { ...titlePrompt(), cacheStrategy: 'stable-first', template: { formatMessages: async () => [new SystemMessage(big), new HumanMessage(big)] } } as never;
      await h.router.structured(prompt, {}, CTX, { ...OWNED, contentMode: 'unrestricted' });

      const messages = h.synapse.requests[0]?.body?.messages as { content: unknown }[];
      expect(JSON.stringify(messages)).toContain('"cache_control":{"type":"ephemeral"}');
    });
  });

  describe('the chat pin', () => {
    async function aliasFor(project: ProjectConfig, role: AiRole = 'chat'): Promise<unknown> {
      const h = harness();
      h.synapse.reply(json(completion(ANSWER)));
      await h.router.structured(titlePrompt(role), {}, { ...CTX, role }, project);
      return envelopeOf(h).alias;
    }

    it("should send the chat's alias pin as it is, whatever model the tier map holds", async () => {
      expect(await aliasFor({ ...OWNED, chatModel: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' }, chatAlias: 'gpt-mini', chatPinned: true })).toBe('gpt-mini');
      expect(await aliasFor({ ...UNRESTRICTED, chatAlias: 'grok', chatPinned: true })).toBe('grok');
    });

    it('should send no alias that is not the author pin, nor an alias pin on another role', async () => {
      expect(await aliasFor({ ...OWNED, chatAlias: 'opus' })).toBeUndefined();
      expect(await aliasFor({ ...OWNED, chatAlias: 'opus', chatPinned: true }, 'plan')).toBeUndefined();
    });

    it("should send no alias for the tier default a turn holds as an unpinned chat's model, leaving the task's routes to pick", async () => {
      expect(await aliasFor({ ...OWNED, chatModel: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } })).toBeUndefined();
    });

    it('should send no alias for a registry slug pin, which only the legacy backend routes', async () => {
      expect(await aliasFor({ ...OWNED, chatModel: { provider: 'openrouter', model: 'anthropic/claude-opus-5' }, chatPinned: true })).toBeUndefined();
    });
  });

  describe('the hard line', () => {
    it('should screen an unrestricted request on the wire, then send the system line first', async () => {
      const h = harness();
      h.synapse.reply(json(completion('{}')));
      const llm = await h.router.chatFor('judge', CTX, UNRESTRICTED);
      await llm.invoke([new SystemMessage('Judge it.'), new HumanMessage('The draft.')]);

      const messages = h.synapse.requests[0]?.body?.messages as { role: string; content: string }[];
      expect(messages[0]).toEqual({ role: 'system', content: HARD_LINE_SYSTEM_LINE });
      expect(messages[1]?.content).toBe('Judge it.');
    });

    it('should propagate a refusal unchanged and send nothing', async () => {
      const h = harness();
      const llm = await h.router.chatFor('judge', CTX, UNRESTRICTED);

      await expect(llm.invoke([new HumanMessage('a lolicon scene')])).rejects.toMatchObject({ code: 'AI_015' });
      expect(h.synapse.requests).toEqual([]);
    });

    it('should leave a standard request untouched', async () => {
      const h = harness();
      h.synapse.reply(json(completion('{}')));
      await (await h.router.chatFor('judge', CTX, OWNED)).invoke([new HumanMessage('The draft.')]);

      expect((h.synapse.requests[0]?.body?.messages as unknown[]).length).toBe(1);
    });
  });

  describe('telemetry', () => {
    it('should record the model that answered, its list cost and its effort, on an invoke', async () => {
      const h = harness();
      h.synapse.reply(json(completion(ANSWER)));
      await h.router.structured(titlePrompt(), {}, CTX, OWNED);
      await awaitAllCallbacks();

      expect(h.rows[0]).toMatchObject({
        provider: 'openrouter',
        model: 'gpt-5.6-luna',
        costUsd: '0.004',
        costSource: 'provider',
        reasoningEffort: 'low',
        inputTokens: 1200,
        outputTokens: 30,
        tier: 'economy',
        contentMode: 'standard',
      });
    });

    it('should record a streamed call from its final frame', async () => {
      const h = harness();
      h.synapse.reply(
        stream(['{"title":', '"Volume two pacing"}'], { ...SYNAPSE_BLOCK, provider: 'subscription', model: 'claude-opus-5.5', cost: { list_usd: 0.02, billed_usd: 0 } }),
      );
      const output = await h.router.streamStructured(titlePrompt('chat'), {}, { ...CTX, role: 'chat' }, { onDelta: () => undefined }, OWNED);
      await awaitAllCallbacks();

      expect(output).toEqual({ title: 'Volume two pacing' });
      expect(h.rows[0]).toMatchObject({ provider: 'subscription', model: 'claude-opus-5.5', costUsd: '0.02', costSource: 'gateway' });
    });

    it('should name the model that answered each call to the caller, for an invoke and a stream alike', async () => {
      const answered: unknown[] = [];
      const onAnswered = (model: unknown) => void answered.push(model);
      const h = harness();
      h.synapse.reply(json(completion(ANSWER)), stream([ANSWER], { ...SYNAPSE_BLOCK, provider: 'subscription', model: 'claude-opus-5.5' }));
      await h.router.structured(titlePrompt(), {}, { ...CTX, onAnswered }, OWNED);
      await h.router.streamStructured(titlePrompt('chat'), {}, { ...CTX, role: 'chat', onAnswered }, { onDelta: () => undefined }, OWNED);

      expect(answered).toEqual([
        { provider: 'openrouter', model: 'gpt-5.6-luna' },
        { provider: 'subscription', model: 'claude-opus-5.5' },
      ]);
    });

    it("should record a failed call against Synapse and the role's task, with no effort", async () => {
      const h = harness();
      h.synapse.reply(synapseError(422, 'SYN_NO_ELIGIBLE_MODEL'));
      await h.router.structured(titlePrompt(), {}, CTX, OWNED).catch(() => undefined);
      await awaitAllCallbacks();

      expect(h.rows[0]).toMatchObject({ status: 'transport_error', provider: 'synapse', model: 'novel-forge.helper', reasoningEffort: null });
      expect(h.rows[0]?.error).toMatchObject({ code: 'SYN_NO_ELIGIBLE_MODEL' });
    });

    it('should record a budget refusal as refused, since no model ran', async () => {
      const h = harness();
      h.synapse.reply(synapseError(429, 'SYN_BUDGET_CALLS'));
      await h.router.structured(titlePrompt(), {}, CTX, OWNED).catch(() => undefined);
      await awaitAllCallbacks();

      expect(h.rows[0]).toMatchObject({ status: 'refused', error: { code: 'SYN_BUDGET_CALLS' } });
    });
  });

  describe('the llm_cache key', () => {
    type HashRequest = (resolved: unknown, module: unknown, input: unknown, policy?: unknown, routing?: Record<string, unknown>) => string;
    const promptId = { key: 'chat-title', version: '1.0.0' };
    const hashOf = (h: Harness): HashRequest => (h.router as unknown as { hashRequest: HashRequest })['hashRequest'].bind(h.router);

    async function keyFor(project: ProjectConfig, catalog = catalogAt(3)): Promise<string | undefined> {
      const keys: string[] = [];
      const h = harness(undefined, catalog);
      const hash = hashOf(h);
      (h.router as unknown as Record<string, unknown>)['hashRequest'] = (...args: Parameters<HashRequest>) => {
        const key = hash(...args);
        keys.push(key);
        return key;
      };
      h.synapse.reply(json(completion(JSON.stringify({ title: 'x' }))));
      await h.router.structured(titlePrompt('judge'), {}, CTX, project);
      return keys[0];
    }

    it('should keep the legacy key exactly as it was', async () => {
      const h = harness();
      const resolved = { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' };
      const legacy = new Bun.CryptoHasher('sha256').update(JSON.stringify({ ...resolved, promptKey: 'chat-title', promptVersion: '1.0.0', input: {} })).digest('hex');

      expect(hashOf(h)(resolved, promptId, {})).toBe(legacy);
    });

    it('should key a Synapse call on its backend, task, selectors and catalog version, so a tier change or a retarget misses the old answer', async () => {
      const h = harness();
      const resolved = h.router.routeModel('judge', OWNED).resolved;
      const synapseKey = await keyFor(OWNED);
      const routing = (tier: string, catalogVersion = 3) => ({ backend: 'synapse', task: 'novel-forge.review', selectors: { tier, content_mode: 'standard' }, catalogVersion });

      expect(synapseKey).toBe(hashOf(h)(resolved, promptId, {}, undefined, routing('economy')));
      expect(synapseKey).not.toBe(hashOf(h)(resolved, promptId, {}));
      expect(hashOf(h)(resolved, promptId, {}, undefined, routing('performant'))).not.toBe(synapseKey);
      expect(await keyFor(OWNED, catalogAt(4))).not.toBe(synapseKey);
    });

    it("should read the version from the call's own task and selectors", async () => {
      const h = harness();
      h.synapse.reply(json(completion(JSON.stringify({ title: 'x' }))));
      await h.router.structured(titlePrompt('judge'), {}, CTX, OWNED);

      expect(h.synapse.catalogRequests[0]?.url).toBe('http://synapse-server.synapse/api/v1/catalog?task=novel-forge.review&selectors=content_mode%3Astandard%2Ctier%3Aeconomy');
    });

    it('should neither read nor write the cache when the catalog version cannot be read', async () => {
      const h = harness(undefined, synapseError(503, 'SYN_NO_ACTIVE_CATALOG'));
      h.synapse.reply(json(completion(JSON.stringify({ title: 'x' }))));
      await h.router.structured(titlePrompt('judge'), {}, CTX, OWNED);
      await awaitAllCallbacks();

      expect(h.cacheReads).toBe(0);
      expect(h.rows.filter(row => row['cached'])).toEqual([]);
      expect(h.synapse.requests).toHaveLength(1);
    });

    it('should cache an answer under a readable version', async () => {
      const h = harness();
      h.synapse.reply(json(completion(JSON.stringify({ title: 'x' }))));
      await h.router.structured(titlePrompt('judge'), {}, CTX, OWNED);

      expect(h.cacheReads).toBe(1);
      expect(h.rows.filter(row => row['cached'])).toHaveLength(1);
    });
  });

  describe('failures', () => {
    it('should make one call and map a Synapse refusal, never retrying it', async () => {
      const h = harness();
      h.synapse.reply(synapseError(503, 'SYN_PROVIDERS_EXHAUSTED'), json(completion(ANSWER)));

      await expect(h.router.structured(titlePrompt(), {}, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_007', data: { transient: true } });
      expect(h.synapse.requests).toHaveLength(1);
    });

    it("should leave a refused connection to the client's single retry", async () => {
      const h = harness();
      h.synapse.reply(refuseConnection, refuseConnection, json(completion(ANSWER)));

      await expect(h.router.structured(titlePrompt(), {}, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_007', data: { transient: true } });
      expect(h.synapse.requests).toHaveLength(2);
    });

    it('should surface a Synapse budget as the spend limit the author already knows', async () => {
      const h = harness();
      h.synapse.reply(synapseError(429, 'SYN_BUDGET_COST'));

      await expect(h.router.structured(titlePrompt(), {}, CTX, OWNED)).rejects.toMatchObject({ code: 'AI_009' });
    });
  });

  describe('cancellation', () => {
    it('should abort the request to Synapse when the run is cancelled', async () => {
      const h = harness();
      h.synapse.reply(hang);
      h.router.bindRunSignal('run-1');
      const sent = h.synapse.sent();
      const call = h.router.structured(titlePrompt(), {}, { ...CTX, runId: 'run-1' }, OWNED);
      await sent;
      h.router.abortRun('run-1');

      await expect(call).rejects.toMatchObject({ code: 'AI_013' });
      expect(h.synapse.requests[0]?.signal?.aborted).toBe(true);
    });

    it("should bind the run's signal into a tool-loop client, its bindTools copy included", async () => {
      const h = harness();
      h.synapse.reply(hang);
      h.router.bindRunSignal('run-2');
      const llm = await h.router.chatFor('judge', { ...CTX, runId: 'run-2' }, OWNED);
      const sent = h.synapse.sent();
      const call = llm.bindTools?.([{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }]).invoke([new HumanMessage('Judge.')]);
      await sent;
      h.router.abortRun('run-2');

      await expect(call).rejects.toBeDefined();
      expect(h.synapse.requests[0]?.signal?.aborted).toBe(true);
    });

    it('should refuse a run cancelled before the call without sending anything', async () => {
      const h = harness();
      h.router.bindRunSignal('run-3');
      h.router.abortRun('run-3');

      await expect(h.router.structured(titlePrompt(), {}, { ...CTX, runId: 'run-3' }, OWNED)).rejects.toMatchObject({ code: 'AI_013' });
      expect(h.synapse.requests).toEqual([]);
    });
  });
});
