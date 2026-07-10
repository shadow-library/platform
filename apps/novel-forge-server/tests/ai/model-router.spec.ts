/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it, mock } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Config } from '@shadow-library/common';

import { LOCAL_TEST_DEFAULTS, PRODUCTION_DEFAULTS, ROLE_GROUP } from '@modules/ai/defaults';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { MODEL_REGISTRY } from '@modules/ai/models';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { ChatGrokBuild } from '@modules/ai/subprocess-providers';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Minimal DatabaseService stub: cache always misses, cache writes are no-ops.
function stubDatabaseService(): never {
  const noopInsert = { values: () => ({ onConflictDoNothing: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

describe('ModelRouterService.resolveModel', () => {
  // Create a minimal stub — we only need resolveModel which has no DB dependency
  const stubTelemetry = {} as never;
  const router = new ModelRouterService(stubTelemetry, stubDatabaseService());

  it('returns xai/grok-3 for grok_only project regardless of role', () => {
    const resolved = router.resolveModel('extraction', { contentMode: 'grok_only' });
    expect(resolved.provider).toBe('xai');
  });

  it('honours per-project config model override', () => {
    const resolved = router.resolveModel('judge', {
      contentMode: 'standard',
      config: { models: { judge: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } },
    });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-6');
  });

  it('falls through to profile defaults when no override', () => {
    const resolved = router.resolveModel('embedding', { contentMode: 'standard' });
    expect(resolved.provider).toBe(PRODUCTION_DEFAULTS.embedding.provider);
    expect(resolved.model).toBe(PRODUCTION_DEFAULTS.embedding.model);
  });

  it('grok_only overrides per-project model config', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'grok_only',
      config: { models: { generation: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } },
    });
    expect(resolved.provider).toBe('xai');
  });

  it('refinement chat inherits the planning selection when no chat model is set', () => {
    const resolved = router.resolveModel('chat', { contentMode: 'standard', config: { models: { plan: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } } });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-6');
  });

  it('an explicit chat model overrides the planning inheritance', () => {
    const resolved = router.resolveModel('chat', {
      contentMode: 'standard',
      config: { models: { plan: { provider: 'anthropic', model: 'claude-sonnet-4-6' }, chat: { provider: 'xai', model: 'grok-3' } } },
    });
    expect(resolved.model).toBe('grok-3');
  });

  it('maps every fine-grained role to a model group', () => {
    for (const role of Object.keys(PRODUCTION_DEFAULTS)) expect(ROLE_GROUP[role as keyof typeof ROLE_GROUP]).toBeDefined();
  });

  it('builds the grok-build CLI client when its enabled flag is set', () => {
    (Config as unknown as { cache: Map<string, unknown> })['cache'].set('ai.grok-build.enabled', true);
    expect(router.buildClient({ provider: 'xai-grok-build', model: 'grok-build' })).toBeInstanceOf(ChatGrokBuild);
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
});

describe('PRODUCTION_DEFAULTS vs LOCAL_TEST_DEFAULTS', () => {
  it('production defaults use xai for generation', () => {
    expect(PRODUCTION_DEFAULTS.generation.provider).toBe('xai');
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
