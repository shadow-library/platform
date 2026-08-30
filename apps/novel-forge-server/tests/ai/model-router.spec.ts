import { describe, expect, it, mock } from 'bun:test';

import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

import {
  LOCAL_TEST_DEFAULTS,
  PRODUCTION_DEFAULTS,
  REASONING_POLICY,
  resolveReasoningEffort,
  ROLE_GROUP,
  UNRESTRICTED_DEFAULTS,
  UNRESTRICTED_GROUP_DEFAULTS,
} from '@modules/ai/defaults';
import { ModelRouterService, resolveProvider, supportsPromptCaching } from '@modules/ai/model-router.service';
import { MODEL_REGISTRY } from '@modules/ai/models';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { type AppError, Config } from '@shadow-library/common';

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

  it('routes Unrestricted roles through the Unrestricted group map, not a single pin', () => {
    expect(router.resolveModel('generation', { contentMode: 'unrestricted' }).model).toBe(UNRESTRICTED_GROUP_DEFAULTS.writing.model);
    expect(router.resolveModel('extraction', { contentMode: 'unrestricted' }).model).toBe(UNRESTRICTED_GROUP_DEFAULTS.planning.model);
    expect(router.resolveModel('judge', { contentMode: 'unrestricted' }).model).toBe(UNRESTRICTED_GROUP_DEFAULTS.review.model);
    expect(router.resolveModel('title', { contentMode: 'unrestricted' }).model).toBe(UNRESTRICTED_GROUP_DEFAULTS.helper.model);
  });

  it('should pin the image role to the Grok image model in Unrestricted mode, not the writing model', () => {
    const resolved = router.resolveModel('image', { contentMode: 'unrestricted' });
    expect(resolved.model).toBe(UNRESTRICTED_GROUP_DEFAULTS.image.model);
    expect(resolved.model).not.toBe(UNRESTRICTED_GROUP_DEFAULTS.writing.model);
  });

  it('honours per-project config model override', () => {
    const resolved = router.resolveModel('judge', {
      contentMode: 'standard',
      config: { models: { judge: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } },
    });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('anthropic/claude-sonnet-5');
  });

  it('falls through to profile defaults when no override', () => {
    const resolved = router.resolveModel('embedding', { contentMode: 'standard' });
    expect(resolved.provider).toBe(PRODUCTION_DEFAULTS.embedding.provider);
    expect(resolved.model).toBe(PRODUCTION_DEFAULTS.embedding.model);
  });

  it('coerces an Anthropic override on an Unrestricted project back to the group default', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'unrestricted',
      config: { models: { generation: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } },
    });
    expect(resolved.model).toBe(UNRESTRICTED_DEFAULTS.generation.model);
  });

  it('honours a Kimi writing override on an Unrestricted project', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'unrestricted',
      config: { models: { generation: { provider: 'openrouter', model: 'moonshotai/kimi-k3' } } },
    });
    expect(resolved.model).toBe('moonshotai/kimi-k3');
  });

  it('rejects grok-4.3 on an Unrestricted project', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'unrestricted',
      config: { models: { generation: { provider: 'openrouter', model: 'x-ai/grok-4.3' } } },
    });
    expect(resolved.model).toBe(UNRESTRICTED_DEFAULTS.generation.model);
  });

  it('refinement chat inherits the planning selection when no chat model is set', () => {
    const resolved = router.resolveModel('chat', { contentMode: 'standard', config: { models: { plan: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } } });
    expect(resolved.provider).toBe('openrouter');
    expect(resolved.model).toBe('anthropic/claude-sonnet-5');
  });

  it('an explicit chat model overrides the planning inheritance', () => {
    const resolved = router.resolveModel('chat', {
      contentMode: 'standard',
      config: { models: { plan: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' }, chat: { provider: 'openrouter', model: 'x-ai/grok-4.6' } } },
    });
    expect(resolved.model).toBe('x-ai/grok-4.6');
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
    expect(router.buildClient({ provider: 'ollama', model: 'x-ai/grok-4.6' })).toBeInstanceOf(ChatOllama);
  });

  it('should fall back to the registry provider when the resolution names none', () => {
    expect(resolveProvider({ provider: '', model: 'x-ai/grok-4.6' })).toBe('openrouter');
    expect(router.buildClient({ provider: '', model: 'x-ai/grok-4.6' })).toBeInstanceOf(ChatOpenAI);
  });

  it('should reject a model whose provider is neither resolved nor in the registry', () => {
    expect(() => router.buildClient({ provider: '', model: 'not-a-real-model' })).toThrow();
  });

  it('should reject an image model, which the router never serves', () => {
    expect(() => router.buildClient({ provider: '', model: 'grok-imagine-image-2.0' })).toThrow();
  });

  it('should route every former vendor through one openrouter client carrying the gateway credential', () => {
    for (const model of ['x-ai/grok-4.6', 'anthropic/claude-sonnet-5', 'openai/gpt-5.4']) {
      const client = router.buildClient({ provider: 'openrouter', model }) as ChatOpenAI;
      expect(client.model).toBe(model);
      expect(client.clientConfig.baseURL).toBe('https://openrouter.ai/api/v1');
      expect(client.clientConfig.apiKey).toBe('test-openrouter-key');
    }
  });

  it('should refuse to build an openrouter client with no credential rather than let the SDK fail mid-call', () => {
    setConfig('ai.openrouter.api.key', undefined);
    let error: AppError | null = null;
    try {
      router.buildClient({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' });
    } catch (err) {
      error = err as AppError;
    } finally {
      setConfig('ai.openrouter.api.key', 'test-openrouter-key');
    }
    expect(error?.code).toBe('AI_006');
    expect(error?.status).toBe(500);
  });

  it('should point the openrouter client at its configured base url', () => {
    setConfig('ai.openrouter.api.url', 'http://gateway/openrouter');
    expect((router.buildClient({ provider: 'openrouter', model: 'x-ai/grok-4.6' }) as ChatOpenAI).clientConfig.baseURL).toBe('http://gateway/openrouter');
    setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');
  });

  it('should keep the local-test profile on ollama', () => {
    for (const role of ['generation', 'judge', 'chat'] as const) {
      expect(router.buildClient(LOCAL_TEST_DEFAULTS[role])).toBeInstanceOf(ChatOllama);
    }
  });
});

describe('resolveReasoningEffort', () => {
  it('should omit reasoning for an optional model under the helper "none" policy it cannot express', () => {
    expect(REASONING_POLICY.helper).toBe('none');
    expect(resolveReasoningEffort('anthropic/claude-sonnet-5', 'helper')).toBeUndefined();
  });

  it('should send "none" for an optional model that lists it as a supported effort', () => {
    expect(resolveReasoningEffort('openai/gpt-5.6-luna', 'helper')).toBe('none');
    expect(resolveReasoningEffort('openai/gpt-5.4-mini', 'helper')).toBe('none');
  });

  it('should send the policy effort for an optional model that supports it', () => {
    expect(resolveReasoningEffort('anthropic/claude-sonnet-5', 'writing')).toBe('low');
    expect(resolveReasoningEffort('openai/gpt-5.4', 'planning')).toBe('low');
  });

  it('should omit reasoning for an optional model that declares no effort scale', () => {
    expect(resolveReasoningEffort('anthropic/claude-haiku-4.5', 'writing')).toBeUndefined();
    expect(resolveReasoningEffort('anthropic/claude-haiku-4.5', 'helper')).toBeUndefined();
  });

  it('should clamp a mandatory model to its lowest effort when the policy asks for none', () => {
    expect(resolveReasoningEffort('x-ai/grok-4.6', 'helper')).toBe('low');
  });

  it('should send the policy effort for a mandatory model that supports it', () => {
    expect(resolveReasoningEffort('x-ai/grok-4.6', 'writing')).toBe('low');
    expect(resolveReasoningEffort('x-ai/grok-4.6', 'review')).toBe('low');
  });

  it('should send nothing for a model with no reasoning metadata', () => {
    expect(resolveReasoningEffort('qwen3:14b', 'writing')).toBeUndefined();
    expect(resolveReasoningEffort('not-a-real-model', 'writing')).toBeUndefined();
  });
});

describe('ModelRouterService.buildClient reasoning', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService());

  setConfig('ai.openrouter.api.key', 'test-openrouter-key');
  setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');

  it('should send no reasoning field when the caller names no role', () => {
    const client = router.buildClient({ provider: 'openrouter', model: 'x-ai/grok-4.6' }) as ChatOpenAI;
    expect(client.modelKwargs).toEqual({});
  });

  it('should clamp a mandatory model to its floor for a helper role', () => {
    const client = router.buildClient({ provider: 'openrouter', model: 'x-ai/grok-4.6' }, { role: 'title' }) as ChatOpenAI;
    expect(client.modelKwargs).toEqual({ reasoning: { effort: 'low' } });
  });

  it('should disable reasoning outright for an optional model on a helper role', () => {
    const client = router.buildClient({ provider: 'openrouter', model: 'openai/gpt-5.6-luna' }, { role: 'compact' }) as ChatOpenAI;
    expect(client.modelKwargs).toEqual({ reasoning: { effort: 'none' } });
  });

  it('should omit reasoning for an optional model with no effort scale', () => {
    const client = router.buildClient({ provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' }, { role: 'epitome' }) as ChatOpenAI;
    expect(client.modelKwargs).toEqual({});
  });

  it('should not disturb the ollama client, which disables thinking on its own', () => {
    expect(router.buildClient({ provider: 'ollama', model: 'qwen3:14b' }, { role: 'title' })).toBeInstanceOf(ChatOllama);
  });
});

describe('supportsPromptCaching', () => {
  it('fires only for anthropic models routed through openrouter', () => {
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' })).toBe(true);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'x-ai/grok-4.6' })).toBe(false);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'openai/gpt-5.4' })).toBe(false);
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
    expect(PRODUCTION_DEFAULTS.generation.model).toBe('moonshotai/kimi-k3');
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
