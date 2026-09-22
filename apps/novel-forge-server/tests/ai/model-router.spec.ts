import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { type BaseMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { ChatOpenAI } from '@langchain/openai';

import {
  PRODUCTION_DEFAULTS,
  REASONING_POLICY,
  resolveReasoningEffort,
  ROLE_GROUP,
  UNRESTRICTED_DEFAULTS,
  UNRESTRICTED_GROUP_DEFAULTS,
  UNRESTRICTED_LLM_ALLOWLIST,
} from '@modules/ai/defaults';
import { ModelRouterService, resolveProvider, supportsPromptCaching } from '@modules/ai/model-router.service';
import { MODEL_MAP, MODEL_REGISTRY } from '@modules/ai/models';
import { appearanceDescribePrompt } from '@modules/ai/prompts/appearance-describe.prompt';
import { type AppearanceDescribeOutput } from '@modules/ai/schemas/appearance-describe.schema';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { type OutlineOutput, OutlineSchema, validateOutlineCoverage } from '@modules/ai/schemas/outline.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
import { type AppError, Config } from '@shadow-library/common';

// Minimal DatabaseService stub: cache always misses, cache writes are no-ops.
function stubDatabaseService(): never {
  const noopInsert = { values: () => ({ onConflictDoNothing: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

// The quota guard is exercised in its own suite; here it is a no-op so routing/dispatch tests stay pure.
function stubQuotaService(): never {
  return { enforce: async () => undefined } as never;
}

// The router reads provider credentials and base URLs straight off the Config cache, which no test
// bootstrap populates — seed it directly so a client can be constructed without a real environment.
function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

describe('ModelRouterService.resolveModel', () => {
  // Create a minimal stub — we only need resolveModel which has no DB dependency
  const stubTelemetry = {} as never;
  const router = new ModelRouterService(stubTelemetry, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);

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

  it('should resolve an unpinned ideation role to Claude Opus 5 on a standard project', () => {
    const resolved = router.resolveModel('ideation', { contentMode: 'standard' });
    expect(resolved).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });
  });

  it('should resolve an unpinned ideation role to GLM 5.2 on an unrestricted project, since Opus is not on the unrestricted allowlist', () => {
    const resolved = router.resolveModel('ideation', { contentMode: 'unrestricted' });
    expect(resolved).toEqual({ provider: 'openrouter', model: 'z-ai/glm-5.2' });
  });

  describe('with the owner’s defaults', () => {
    const sonnet = { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' };
    const kimi = { provider: 'openrouter', model: 'moonshotai/kimi-k3' };

    it('should use the owner’s default for a group the project leaves unset', () => {
      expect(router.resolveModel('ideation', { contentMode: 'standard' }, undefined, { ideation: sonnet })).toEqual(sonnet);
      expect(router.resolveModel('revision', { contentMode: 'standard' }, undefined, { writing: sonnet })).toEqual(sonnet);
    });

    it('should let a project override outrank the owner’s default', () => {
      const project = { contentMode: 'standard', config: { models: { generation: kimi } } };
      expect(router.resolveModel('generation', project, undefined, { writing: sonnet })).toEqual(kimi);
    });

    it('should skip an owner default the registry no longer lists', () => {
      const resolved = router.resolveModel('ideation', { contentMode: 'standard' }, undefined, { ideation: { provider: 'openrouter', model: 'retired/model' } });
      expect(resolved).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });
    });

    it('should only honour an owner default on an unrestricted project when the allowlist carries it', () => {
      expect(router.resolveModel('generation', { contentMode: 'unrestricted' }, undefined, { writing: kimi })).toEqual(kimi);
      expect(router.resolveModel('ideation', { contentMode: 'unrestricted' }, undefined, { ideation: sonnet }).model).toBe(UNRESTRICTED_GROUP_DEFAULTS.ideation.model);
    });

    it('should load the defaults for the project before resolving', async () => {
      const defaultsFor = mock(async () => ({ helper: sonnet }));
      const loaded = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor } as never);

      expect(await loaded.resolveFor('title', { contentMode: 'standard' }, 42n)).toEqual(sonnet);
      expect(defaultsFor).toHaveBeenCalledWith({ contentMode: 'standard' }, 42n);
    });
  });
});

describe('ModelRouterService.buildClient', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);

  setConfig('ai.openrouter.api.key', 'test-openrouter-key');
  setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');

  it('should refuse an explicitly resolved provider the router cannot serve rather than rerouting the model', () => {
    expect(() => router.buildClient({ provider: 'ollama', model: 'x-ai/grok-4.6' })).toThrow();
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

  it('should leave retries to the router by building the openrouter client with none of its own', () => {
    const client = router.buildClient({ provider: 'openrouter', model: 'x-ai/grok-4.6' }) as unknown as { caller: { maxRetries: number } };
    expect(client.caller.maxRetries).toBe(0);
  });
});

describe('resolveReasoningEffort', () => {
  it('should give ideation the same reasoning policy as chat', () => {
    expect(REASONING_POLICY.ideation).toBe(REASONING_POLICY.chat);
  });

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
    expect(resolveReasoningEffort('openai/gpt-5.4', 'planning')).toBe('medium');
  });

  it('should send medium reasoning for the production planning model', () => {
    expect(REASONING_POLICY.planning).toBe('medium');
    expect(resolveReasoningEffort('anthropic/claude-opus-5', 'planning')).toBe('medium');
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
    expect(resolveReasoningEffort('qwen3-embedding:8b', 'writing')).toBeUndefined();
    expect(resolveReasoningEffort('not-a-real-model', 'writing')).toBeUndefined();
  });
});

describe('ModelRouterService.buildClient reasoning', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);

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
});

describe('supportsPromptCaching', () => {
  it('fires only for anthropic models routed through openrouter', () => {
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' })).toBe(true);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'x-ai/grok-4.6' })).toBe(false);
    expect(supportsPromptCaching({ provider: 'openrouter', model: 'openai/gpt-5.4' })).toBe(false);
    expect(supportsPromptCaching({ provider: 'ollama', model: 'qwen3-embedding:8b' })).toBe(false);
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
    for (const m of MODEL_REGISTRY.filter(m => m.kind === 'llm')) {
      expect(m.contextWindow).toBeGreaterThan(0);
    }
  });

  it('should only mark chat models as accepting image input', () => {
    for (const m of MODEL_REGISTRY.filter(m => m.supportsImageInput)) expect(m.kind).toBe('llm');
    expect(MODEL_MAP['z-ai/glm-5.2']?.supportsImageInput).toBeUndefined();
    expect(MODEL_MAP['deepseek/deepseek-v4-pro']?.supportsImageInput).toBeUndefined();
    expect(MODEL_MAP['qwen3-embedding:8b']?.supportsImageInput).toBeUndefined();
  });

  it('every llm entry is an openrouter vendor/model slug', () => {
    for (const m of MODEL_REGISTRY.filter(m => m.kind === 'llm')) {
      expect(m.provider).toBe('openrouter');
      expect(m.id).toMatch(/^[a-z0-9-]+\/.+$/);
    }
  });
});

describe('PRODUCTION_DEFAULTS', () => {
  it('production defaults route generation through openrouter', () => {
    expect(PRODUCTION_DEFAULTS.generation.provider).toBe('openrouter');
    expect(PRODUCTION_DEFAULTS.generation.model).toBe('anthropic/claude-sonnet-5');
  });

  it('covers all required roles', () => {
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
    }
  });
});

describe('ModelRouterService.structured (repair ladder)', () => {
  function makeRouter(fakeChain: { invoke: ReturnType<typeof mock> }): ModelRouterService {
    const stubTelemetry = {} as never;
    const router = new ModelRouterService(stubTelemetry, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
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

  it('reports the schema issues, the prompt and its version above debug level', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: JSON.stringify({ verdict: 'consistent' }) })) };
    const router = makeRouter(fakeChain);
    const records: { level: string; message: string; meta: Record<string, unknown> }[] = [];
    const record = (level: string) => (message: string, meta: Record<string, unknown>) => void records.push({ level, message, meta });
    (router as unknown as Record<string, unknown>)['logger'] = { debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error') };

    await expect(router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' })).rejects.toThrow();

    const above = records.filter(entry => entry.level !== 'debug');
    const warned = above.find(entry => entry.message.startsWith('Attempt 1 parse failed'));
    expect(warned?.meta).toMatchObject({ promptKey: 'judge', promptVersion: '1.0.0' });
    expect(String(warned?.meta['issues'])).toContain('findings');

    const failed = above.find(entry => entry.message === 'All parse attempts failed');
    expect(failed?.level).toBe('error');
    expect(failed?.meta).toMatchObject({ promptKey: 'judge', promptVersion: '1.0.0' });
    expect(String(failed?.meta['issues1'])).toContain('findings');
    expect(String(failed?.meta['issues2'])).toContain('findings');
  });

  it('throws when all attempts fail', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: 'not json' })) };
    const router = makeRouter(fakeChain);

    await expect(router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' })).rejects.toThrow();
  });

  it('should extract from attempt 1 when the repair answers with no object at all', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1)
          return { content: 'Two things before I hand you anything invented: {"note":"still thinking"}\n\nFinal answer:\n{"verdict":"consistent","findings":[]}' };
        return { content: 'I have said all I can say about this chapter.' };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(callCount).toBe(2);
  });

  it('should extract a prose-wrapped object whose string value carries an unbalanced brace', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1) return { content: 'Verdict below.\n{"verdict":"consistent","findings":[{"severity":"soft","text":"the ward sigil closes with a } glyph"}]}' };
        return { content: 'no further comment' };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.findings[0]?.text).toContain('} glyph');
  });

  it('should still carry the required schema in the conversation the repair rung sees', async () => {
    const seen: BaseMessage[][] = [];
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async (messages: BaseMessage[]) => {
        seen.push(messages);
        callCount++;
        if (callCount === 1) return { content: '{"verdict":"consistent"}' };
        return { content: JSON.stringify({ verdict: 'consistent', findings: [] }) };
      }),
    };
    const router = makeRouter(fakeChain);

    await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });

    const repairConversation = (seen[1] ?? []).map(message => String(message.content)).join('\n');
    expect(repairConversation).toContain('matching this JSON schema');
    expect(repairConversation).toContain('one finding, citing the canon it conflicts with');
  });

  describe('with an advisory rule', () => {
    const ctx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
    const flagged = JSON.stringify({ verdict: 'consistent', findings: [{ severity: 'soft', text: 'flagged' }] });
    const clean = JSON.stringify({ verdict: 'consistent', findings: [] });
    const advisoryPrompt = { ...fakePrompt, advise: (data: JudgeOutput) => (data.findings.length > 0 ? ['advisory: finding present'] : []) };

    it('should spend one repair on an advisory issue and show it to the repair', async () => {
      const seen: BaseMessage[][] = [];
      const fakeChain = {
        invoke: mock(async (messages: BaseMessage[]) => {
          seen.push(messages);
          return { content: seen.length === 1 ? flagged : clean };
        }),
      };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toEqual([]);
      expect(seen).toHaveLength(2);
      expect((seen[1] ?? []).map(message => String(message.content)).join('\n')).toContain('advisory: finding present');
    });

    it('should accept the repair when the advisory issue survives it', async () => {
      const fakeChain = { invoke: mock(async () => ({ content: flagged })) };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toHaveLength(1);
      expect(fakeChain.invoke).toHaveBeenCalledTimes(2);
    });

    it('should log an advisory-only repair apart from a parse failure', async () => {
      const fakeChain = { invoke: mock(async () => ({ content: flagged })) };
      const router = makeRouter(fakeChain);
      const records: { message: string; meta: Record<string, unknown> }[] = [];
      const record = (message: string, meta: Record<string, unknown>) => void records.push({ message, meta });
      (router as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, info: record, warn: record, error: record };

      await router.structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(records.some(entry => entry.message.startsWith('Attempt 1 parse failed'))).toBe(false);
      expect(records.find(entry => entry.message.startsWith('Attempt 1 has advisory issues only'))?.meta).toMatchObject({ advisory: true });
    });

    it('should send blocking and advisory issues in one repair request', async () => {
      const seen: BaseMessage[][] = [];
      const both = { ...advisoryPrompt, postValidate: (data: JudgeOutput) => (data.verdict === 'consistent' && data.findings.length > 0 ? ['blocking: verdict'] : []) };
      const fakeChain = {
        invoke: mock(async (messages: BaseMessage[]) => {
          seen.push(messages);
          return { content: seen.length === 1 ? flagged : clean };
        }),
      };

      await makeRouter(fakeChain).structured<JudgeOutput>(both, {}, ctx);

      const repair = (seen[1] ?? []).map(message => String(message.content)).join('\n');
      expect(repair).toContain('blocking: verdict');
      expect(repair).toContain('advisory: finding present');
    });

    it('should fall back to the first attempt when the repair breaks the schema', async () => {
      let callCount = 0;
      const fakeChain = {
        invoke: mock(async () => {
          callCount++;
          return { content: callCount === 1 ? flagged : 'no longer json' };
        }),
      };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toHaveLength(1);
    });

    describe('on an array-schema prompt', () => {
      const brief = (title: string) => ({
        chapter: 1,
        volumeKey: 'vol_01',
        title,
        objective: 'Cross the salt flats.',
        events: ['The caravan stalls.'],
        requiredContext: [],
        endingContract: { hookType: 'turn', emotionalBeat: 'dread', openQuestion: 'who cut the rope?', handoffState: 'stranded', mustNotResolve: [] },
        chapterPurpose: 'Strands the caravan.',
        readerValue: ['world_state_change'],
      });
      const arrayPrompt = {
        ...fakePrompt,
        key: 'outline' as const,
        schema: OutlineSchema,
        postValidate: (briefs: OutlineOutput) => validateOutlineCoverage(briefs, 1, 1),
        advise: (briefs: OutlineOutput) => (briefs.some(b => b.title.includes('secret')) ? ['advisory: early reveal'] : []),
      };
      const outlineCtx = { ...ctx, promptKey: 'outline', role: 'outline' };
      const firstAttempt = JSON.stringify([brief('The secret road')]);

      it('should keep the first attempt when the repair breaks the schema', async () => {
        let callCount = 0;
        const fakeChain = {
          invoke: mock(async () => {
            callCount++;
            return { content: callCount === 1 ? firstAttempt : 'I would rather not.' };
          }),
        };

        const result = await makeRouter(fakeChain).structured<OutlineOutput>(arrayPrompt, {}, outlineCtx);

        expect(result.map(b => b.title)).toEqual(['The secret road']);
      });

      it('should keep the first attempt when the repair passes the schema but fails a blocking rule', async () => {
        let callCount = 0;
        const fakeChain = {
          invoke: mock(async () => {
            callCount++;
            return { content: callCount === 1 ? firstAttempt : JSON.stringify([{ ...brief('Salt'), chapter: 2 }]) };
          }),
        };

        const result = await makeRouter(fakeChain).structured<OutlineOutput>(arrayPrompt, {}, outlineCtx);

        expect(result.map(b => [b.chapter, b.title])).toEqual([[1, 'The secret road']]);
      });
    });
  });
});

// The over-capacity cases never reach the model_calls insert, so the shared cache-only stub covers them;
// the success case does, and needs a chainable `insert().values().catch()` the shared stub doesn't offer.
function stubDatabaseServiceForImages(): never {
  const noopInsert = { values: () => ({ catch: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

describe('ModelRouterService.images reference validation', () => {
  function makeRouter(): ModelRouterService {
    return new ModelRouterService({} as never, stubDatabaseServiceForImages(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
  }

  const ctx = { projectId: BigInt(1), promptKey: 'illustration-compose', promptVersion: '1.0.0', role: 'image' as const };

  it('should throw AI_010 when the request exceeds the resolved model’s reference capacity', async () => {
    const router = makeRouter();
    const maxInputReferences = MODEL_MAP[PRODUCTION_DEFAULTS.image.model]?.maxInputReferences ?? 0;
    const overLimit = Array.from({ length: maxInputReferences + 1 }, (_, i) => `data:image/png;base64,${i}`);

    let error: { code: string } | undefined;
    await router.images({ prompt: 'a lone tower', n: 1, inputReferences: overLimit }, ctx).catch(err => (error = err as { code: string }));
    expect(error?.code).toBe('AI_010');
  });

  it('should throw AI_010 for a model that accepts no reference images at all', async () => {
    const router = makeRouter();
    const project = { contentMode: 'standard', config: { models: { image: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } } };

    let error: { code: string } | undefined;
    await router.images({ prompt: 'a lone tower', n: 1, inputReferences: ['data:image/png;base64,x'] }, ctx, project).catch(err => (error = err as { code: string }));
    expect(error?.code).toBe('AI_010');
  });

  it('should not validate reference capacity when no references are supplied', async () => {
    setConfig('ai.openrouter.api.key', 'test-key');
    setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from('png').toString('base64'), media_type: 'image/png' }] }),
    });
    try {
      const router = makeRouter();
      const images = await router.images({ prompt: 'a lone tower', n: 1 }, ctx);
      expect(images).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('ModelRouterService.referenceCapacity', () => {
  function makeRouter(): ModelRouterService {
    return new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
  }

  it('should resolve the capacity of the standard-profile image default', async () => {
    const router = makeRouter();
    const expected = MODEL_MAP[PRODUCTION_DEFAULTS.image.model]?.maxInputReferences ?? 0;
    expect(await router.referenceCapacity({ contentMode: 'standard' })).toBe(expected);
  });

  it('should resolve the capacity of the unrestricted-profile image default', async () => {
    const router = makeRouter();
    const expected = MODEL_MAP[UNRESTRICTED_DEFAULTS.image.model]?.maxInputReferences ?? 0;
    expect(await router.referenceCapacity({ contentMode: 'unrestricted' })).toBe(expected);
  });

  it('should honour a project-level image override', async () => {
    const router = makeRouter();
    const project = { contentMode: 'standard', config: { models: { image: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } } };
    expect(await router.referenceCapacity(project)).toBe(0);
  });

  it('should fall back to zero for a model absent from the registry’s reference metadata', () => {
    expect(MODEL_MAP['anthropic/claude-sonnet-5']?.maxInputReferences ?? 0).toBe(0);
  });
});

describe('vision role routing', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);

  it('should default the vision role to an image-capable model in both production and unrestricted maps', () => {
    expect(MODEL_MAP[PRODUCTION_DEFAULTS.vision.model]?.supportsImageInput).toBe(true);
    expect(MODEL_MAP[UNRESTRICTED_DEFAULTS.vision.model]?.supportsImageInput).toBe(true);
    expect(UNRESTRICTED_LLM_ALLOWLIST as readonly string[]).toContain(UNRESTRICTED_DEFAULTS.vision.model);
  });

  it('should ignore the owner’s text-only helper default when resolving the vision role', () => {
    const glm = { provider: 'openrouter', model: 'z-ai/glm-5.2' };
    expect(router.resolveModel('vision', { contentMode: 'standard' }, undefined, { helper: glm })).toEqual(PRODUCTION_DEFAULTS.vision);
    expect(router.resolveModel('vision', { contentMode: 'unrestricted' }, undefined, { helper: glm })).toEqual(UNRESTRICTED_DEFAULTS.vision);
  });

  it('should route a permissive plugin policy to the unrestricted vision default', () => {
    expect(router.resolveModel('vision', { contentMode: 'standard' }, { writerClass: 'permissive' } as never)).toEqual(UNRESTRICTED_DEFAULTS.vision);
  });
});

describe('ModelRouterService.structuredWithImage', () => {
  const IMAGE = `data:image/png;base64,${'QUJD'.repeat(4096)}`;
  const DESCRIPTION = { appearance: 'A broad-shouldered man in dented plate armour, close-cropped grey hair, a scar across the left brow.', confidence: 'high' };
  const ctx = { projectId: BigInt(1), promptKey: 'appearance-describe', promptVersion: '1.0.0', role: 'vision' };
  const input = { subjectLabel: 'Aldric', note: 'the armored man in the center' };

  beforeAll(async () => {
    await new FakeListChatModel({ responses: ['warm'] }).invoke('warm');
    await awaitAllCallbacks();
  });

  function makeRouter(client: unknown, db: unknown = stubDatabaseService(), telemetry: unknown = {}): { router: ModelRouterService; buildClient: ReturnType<typeof mock> } {
    const router = new ModelRouterService(telemetry as never, db as never, stubQuotaService(), { defaultsFor: async () => undefined } as never);
    const buildClient = mock(() => client);
    (router as unknown as Record<string, unknown>)['buildClient'] = buildClient;
    return { router, buildClient };
  }

  it('should append the image as an image_url part after the text of the last human message', async () => {
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({ content: JSON.stringify(DESCRIPTION) }));
    const { router } = makeRouter({ invoke });

    await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, IMAGE, ctx);

    const messages = invoke.mock.calls[0]?.[0] ?? [];
    const withImage = messages.filter(message => Array.isArray(message.content));
    expect(withImage).toHaveLength(1);
    expect(withImage[0]?.getType()).toBe('human');
    const parts = withImage[0]?.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts.map(part => part.type)).toEqual(['text', 'image_url']);
    expect(parts[0]?.text).toContain('Subject: Aldric');
    expect(parts[0]?.text).toContain('the armored man in the center');
    expect(parts[1]?.image_url?.url).toBe(IMAGE);
    expect(messages[0]?.getType()).toBe('system');
    expect(String(messages.at(-1)?.content)).toContain('JSON schema');
  });

  it('should throw AI_011 before building a client or fetching when the resolved model accepts no images', async () => {
    const invoke = mock(async () => ({ content: JSON.stringify(DESCRIPTION) }));
    const { router, buildClient } = makeRouter({ invoke });
    const project = { contentMode: 'standard', config: { models: { vision: { provider: 'openrouter', model: 'z-ai/glm-5.2' } } } };
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(async () => new Response('{}'));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

    let error: AppError | undefined;
    try {
      await router.structuredWithImage(appearanceDescribePrompt, input, IMAGE, ctx, project).catch(err => (error = err as AppError));
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(error?.code).toBe('AI_011');
    expect(buildClient).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return the parsed structured output', async () => {
    const { router } = makeRouter({ invoke: async () => ({ content: JSON.stringify(DESCRIPTION) }) });
    const result = await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, IMAGE, ctx);
    expect(result).toEqual(DESCRIPTION as AppearanceDescribeOutput);
  });

  it('should bypass llm_cache even for a cacheable role, since the request hash cannot see the image', async () => {
    const findFirst = mock(async () => undefined);
    const db = { getPostgresClient: () => ({ query: { llmCache: { findFirst } }, insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }) }) };
    const judge = {
      key: 'judge' as const,
      version: '1.0.0',
      kind: 'analytical' as const,
      system: 'test',
      template: { formatMessages: async () => [] } as never,
      schema: JudgeSchema,
    };
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({ content: JSON.stringify({ verdict: 'consistent', findings: [] }) }));
    const { router } = makeRouter({ invoke }, db);

    await router.structuredWithImage<JudgeOutput>(
      judge,
      {},
      IMAGE,
      { ...ctx, role: 'judge' },
      { config: { models: { judge: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5' } } } },
    );

    expect(findFirst).not.toHaveBeenCalled();
    const imageOnly = invoke.mock.calls[0]?.[0]?.find(message => Array.isArray(message.content));
    expect((imageOnly?.content as { type: string }[]).map(part => part.type)).toEqual(['image_url']);
  });

  it('should write a model_calls row that carries no image data and does not count the base64 as prompt tokens', async () => {
    const rows: unknown[] = [];
    const telemetryDb = { insert: () => ({ values: async (row: unknown) => void rows.push(row) }) };
    const telemetry = new TelemetryHandler({ getPostgresClient: () => telemetryDb } as never);
    const { router } = makeRouter(new FakeListChatModel({ responses: [JSON.stringify(DESCRIPTION)] }), stubDatabaseService(), telemetry);
    const image = `data:image/png;base64,${'QUJD'.repeat(1024)}`;

    await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, image, ctx);
    await awaitAllCallbacks();

    expect(rows).toHaveLength(1);
    const serialized = JSON.stringify(rows[0], (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value));
    expect(serialized).toContain('"promptKey":"appearance-describe"');
    expect(serialized).not.toContain('QUJD');
    expect(serialized).not.toContain('data:image');
    // Tokenising the image itself costs half a second; base64 runs about two characters a token, so a count that
    // included it would clear a quarter of its length.
    expect((rows[0] as { inputTokens: number }).inputTokens).toBeLessThan(image.length / 4);
  });
});

describe('ModelRouterService telemetry reasoning effort', () => {
  const judgePrompt = {
    key: 'judge' as const,
    version: '1.0.0',
    kind: 'analytical' as const,
    system: 'test',
    template: { formatMessages: async () => [] } as never,
    schema: JudgeSchema,
  };
  const ctx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };

  async function recordedEffort(model: string): Promise<unknown> {
    const rows: { reasoningEffort?: unknown }[] = [];
    const telemetryDb = { insert: () => ({ values: async (row: { reasoningEffort?: unknown }) => void rows.push(row) }) };
    const telemetry = new TelemetryHandler({ getPostgresClient: () => telemetryDb } as never);
    const router = new ModelRouterService(telemetry, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
    (router as unknown as Record<string, unknown>)['buildClient'] = () => new FakeListChatModel({ responses: [JSON.stringify({ verdict: 'consistent', findings: [] })] });

    await router.structured<JudgeOutput>(judgePrompt, {}, ctx, { config: { models: { judge: { provider: 'openrouter', model } } } });
    await awaitAllCallbacks();

    expect(rows).toHaveLength(1);
    return rows[0]?.reasoningEffort;
  }

  it('should record the effort the reasoning policy resolved for the call', async () => {
    expect(resolveReasoningEffort('anthropic/claude-sonnet-5', ROLE_GROUP.judge)).toBe('low');
    expect(await recordedEffort('anthropic/claude-sonnet-5')).toBe('low');
  });

  it('should record null when the call sent no reasoning field', async () => {
    expect(resolveReasoningEffort('anthropic/claude-haiku-4.5', ROLE_GROUP.judge)).toBeUndefined();
    expect(await recordedEffort('anthropic/claude-haiku-4.5')).toBeNull();
  });
});
