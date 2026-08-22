import { describe, expect, it, mock } from 'bun:test';

import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

import { LOCAL_TEST_DEFAULTS, PRODUCTION_DEFAULTS, ROLE_GROUP } from '@modules/ai/defaults';
import { ModelRouterService, resolveProvider, supportsPromptCaching } from '@modules/ai/model-router.service';
import { MODEL_REGISTRY } from '@modules/ai/models';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { Config } from '@shadow-library/common';

// Minimal DatabaseService stub: cache always misses, cache writes are no-ops.
function stubDatabaseService(): never {
  const noopInsert = { values: () => ({ onConflictDoNothing: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

// The router reads provider credentials and base URLs straight off the Config cache, which no test
// bootstrap populates — seed it directly so a client can be constructed without a real environment.
function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

describe('ModelRouterService.resolveModel', () => {
  // Create a minimal stub — we only need resolveModel which has no DB dependency
  const stubTelemetry = {} as never;
  const router = new ModelRouterService(stubTelemetry, stubDatabaseService());

  setConfig('ai.grok.llm.model', 'x-ai/grok-3');

  it('returns openrouter/x-ai/grok-3 for grok_only project regardless of role', () => {
    const resolved = router.resolveModel('extraction', { contentMode: 'grok_only' });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('x-ai/grok-3');
  });

  it('honours per-project config model override', () => {
    const resolved = router.resolveModel('judge', {
      contentMode: 'standard',
      config: { models: { judge: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' } } },
    });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('anthropic/claude-sonnet-4.6');
  });

  it('falls through to profile defaults when no override', () => {
    const resolved = router.resolveModel('embedding', { contentMode: 'standard' });
    expect(resolved.provider).toBe(PRODUCTION_DEFAULTS.embedding.provider);
    expect(resolved.model).toBe(PRODUCTION_DEFAULTS.embedding.model);
  });

  it('grok_only overrides per-project model config', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'grok_only',
      config: { models: { generation: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' } } },
    });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('x-ai/grok-3');
  });

  it('refinement chat inherits the planning selection when no chat model is set', () => {
    const resolved = router.resolveModel('chat', { contentMode: 'standard', config: { models: { plan: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' } } } });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('anthropic/claude-sonnet-4.6');
  });

  it('an explicit chat model overrides the planning inheritance', () => {
    const resolved = router.resolveModel('chat', {
      contentMode: 'standard',
      config: { models: { plan: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' }, chat: { provider: 'openrouter', model: 'x-ai/grok-3' } } },
    });
    expect(resolved.model).toBe('x-ai/grok-3');
  });

  it('maps every fine-grained role to a model group', () => {
    for (const role of Object.keys(PRODUCTION_DEFAULTS)) expect(ROLE_GROUP[role as keyof typeof ROLE_GROUP]).toBeDefined();
  });
});

describe('ModelRouterService.buildClient', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService());

  setConfig('ai.openrouter.api.key', 'test-openrouter-key');
  setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');

  it('should let an explicitly resolved provider win over the registry entry for that model', () => {
    expect(router.buildClient({ provider: 'ollama', model: 'x-ai/grok-3' })).toBeInstanceOf(ChatOllama);
  });

  it('should fall back to the registry provider when the resolution names none', () => {
    expect(resolveProvider({ provider: '', model: 'x-ai/grok-3' })).toBe('openrouter');
    expect(router.buildClient({ provider: '', model: 'x-ai/grok-3' })).toBeInstanceOf(ChatOpenAI);
  });

  it('should reject a model whose provider is neither resolved nor in the registry', () => {
    expect(() => router.buildClient({ provider: '', model: 'not-a-real-model' })).toThrow();
  });

  it('should reject an image model, which the router never serves', () => {
    expect(() => router.buildClient({ provider: '', model: 'grok-2-image' })).toThrow();
  });

  it('should route every former vendor through one openrouter client carrying the gateway credential', () => {
    for (const model of ['x-ai/grok-3', 'anthropic/claude-sonnet-4.6', 'openai/gpt-4o']) {
      const client = router.buildClient({ provider: 'openrouter', model }) as ChatOpenAI;
      expect(client.model).toBe(model);
      expect(client.clientConfig.baseURL).toBe('https://openrouter.ai/api/v1');
      expect(client.clientConfig.apiKey).toBe('test-openrouter-key');
    }
  });

  it('should point the openrouter client at its configured base url', () => {
    setConfig('ai.openrouter.api.url', 'http://gateway/openrouter');
    expect((router.buildClient({ provider: 'openrouter', model: 'x-ai/grok-3' }) as ChatOpenAI).clientConfig.baseURL).toBe('http://gateway/openrouter');
    setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');
  });

  it('should keep the local-test profile on ollama', () => {
    for (const role of ['generation', 'judge', 'chat'] as const) {
      expect(router.buildClient(LOCAL_TEST_DEFAULTS[role])).toBeInstanceOf(ChatOllama);
    }
  });
});

describe('supportsPromptCaching', () => {
  it('fires only for anthropic models routed through openrouter', () => {
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6' })).toBe(true);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'x-ai/grok-3' })).toBe(false);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'openai/gpt-4o' })).toBe(false);
    expect(supportsPromptCaching({ provider: 'ollama', model: 'qwen3:14b' })).toBe(false);
  });

  it('resolves the provider from the registry when the resolution names none', () => {
    expect(supportsPromptCaching({ provider: '', model: 'anthropic/claude-haiku-4.5' })).toBe(true);
  });
});

describe('MODEL_REGISTRY', () => {
  it('contains at least one llm, one embedding, and one image entry', () => {
    expect(MODEL_REGISTRY.some(m => m.kind === 'llm')).toBe(true);
    expect(MODEL_REGISTRY.some(m => m.kind === 'embedding')).toBe(true);
    expect(MODEL_REGISTRY.some(m => m.kind === 'image')).toBe(true);
  });

  it('all LLM entries have contextWindow > 0', () => {
    for (const m of MODEL_REGISTRY.filter(m => m.kind === 'llm' && m.provider !== 'ollama')) {
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it('every hosted llm entry is an openrouter vendor/model slug', () => {
    for (const m of MODEL_REGISTRY.filter(m => m.kind === 'llm' && m.provider !== 'ollama')) {
      expect(m.provider).toBe('openrouter');
      expect(m.id).toMatch(/^[a-z0-9-]+\/.+$/);
    }
  });
});

describe('PRODUCTION_DEFAULTS vs LOCAL_TEST_DEFAULTS', () => {
  it('production defaults route generation through openrouter', () => {
    expect(PRODUCTION_DEFAULTS.generation.provider).toBe('openrouter');
    expect(PRODUCTION_DEFAULTS.generation.model).toBe('x-ai/grok-3');
  });

  it('local-test defaults use ollama for all LLM roles', () => {
    for (const role of ['extraction', 'generation', 'judge'] as const) {
      expect(LOCAL_TEST_DEFAULTS[role].provider).toBe('ollama');
    }
  });

  it('both profiles cover all required roles', () => {
    const requiredRoles = [
      'extraction',
      'generation',
      'judge',
      'fix',
      'outline',
      'revision',
      'title',
      'continuity',
      'validation',
      'review',
      'plan',
      'skeleton',
      'bible',
      'embedding',
      'image',
    ];
    for (const role of requiredRoles) {
      expect(PRODUCTION_DEFAULTS[role as keyof typeof PRODUCTION_DEFAULTS]).toBeDefined();
      expect(LOCAL_TEST_DEFAULTS[role as keyof typeof LOCAL_TEST_DEFAULTS]).toBeDefined();
    }
  });
});

describe('ModelRouterService.structured (repair ladder)', () => {
  function makeRouter(fakeChain: { invoke: ReturnType<typeof mock> }): ModelRouterService {
    const stubTelemetry = {} as never;
    const router = new ModelRouterService(stubTelemetry, stubDatabaseService());
    // Patch buildClient so no real provider is instantiated (no API keys needed in tests) — the router
    // invokes the returned client directly with the formatted messages.
    (router as unknown as Record<string, unknown>)['buildClient'] = () => fakeChain;
    return router;
  }

  // A prompt whose template yields no messages of its own — buildMessages appends the schema
  // instruction — so the fake chain drives the repair ladder deterministically.
  const fakePrompt = {
    key: 'judge' as const,
    version: '1.0.0',
    kind: 'analytical' as const,
    system: 'test',
    template: { formatMessages: async () => [] } as never,
    schema: JudgeSchema,
  };

  it('returns parsed result on first success', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: JSON.stringify({ verdict: 'consistent', findings: [] }) })) };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(fakeChain.invoke).toHaveBeenCalledTimes(1);
  });

  it('attempts repair on first parse failure', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1) return { content: 'not json at all' };
        return { content: JSON.stringify({ verdict: 'consistent', findings: [] }) };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(callCount).toBe(2);
  });

  it('throws when all attempts fail', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: 'not json' })) };
    const router = makeRouter(fakeChain);

    await expect(router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' })).rejects.toThrow();
  });
});
