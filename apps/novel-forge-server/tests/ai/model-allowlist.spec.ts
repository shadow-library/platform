import { describe, expect, it } from 'bun:test';

import { isRegisteredModel, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { Config } from '@shadow-library/common';

function stubDatabaseService(): never {
  return { getPostgresClient: () => ({}) } as never;
}

function stubQuotaService(): never {
  return { enforce: async () => undefined } as never;
}

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

describe('isRegisteredModel', () => {
  it('should accept a registry model paired with its registry provider', () => {
    expect(isRegisteredModel({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5' })).toBe(true);
    expect(isRegisteredModel({ provider: 'ollama', model: 'qwen3-embedding:8b' })).toBe(true);
  });

  it('should reject a model id that is not in the registry', () => {
    expect(isRegisteredModel({ provider: 'openrouter', model: 'anthropic/claude-omega-max' })).toBe(false);
    expect(isRegisteredModel({ provider: 'openrouter', model: '../../etc/passwd' })).toBe(false);
  });

  it('should reject a registry model id paired with the wrong provider', () => {
    expect(isRegisteredModel({ provider: 'ollama', model: 'anthropic/claude-sonnet-5' })).toBe(false);
    expect(isRegisteredModel({ provider: 'openrouter', model: 'qwen3-embedding:8b' })).toBe(false);
  });
});

describe('ModelRouterService.resolveModel fail-closed guard', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);

  it('should return a registry-backed override on a standard project', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'standard',
      config: { models: { generation: { provider: 'openrouter', model: 'moonshotai/kimi-k3' } } },
    });
    expect(resolved.model).toBe('moonshotai/kimi-k3');
  });

  it('should refuse to dispatch a non-registry override on a standard project', () => {
    expect(() =>
      router.resolveModel('generation', {
        contentMode: 'standard',
        config: { models: { generation: { provider: 'openrouter', model: 'evil/unbounded-spend' } } },
      }),
    ).toThrow();
  });

  it('should still coerce a disallowed override back to the default on an unrestricted project', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'unrestricted',
      config: { models: { generation: { provider: 'openrouter', model: 'evil/unbounded-spend' } } },
    });
    expect(resolved.model).toBe(UNRESTRICTED_DEFAULTS.generation.model);
  });

  it('should preserve an allowlisted override on an unrestricted project', () => {
    const resolved = router.resolveModel('generation', {
      contentMode: 'unrestricted',
      config: { models: { generation: { provider: 'openrouter', model: 'x-ai/grok-4.6' } } },
    });
    expect(resolved.model).toBe('x-ai/grok-4.6');
  });
});

describe('ModelRouterService.buildClient fail-closed backstop', () => {
  const router = new ModelRouterService({} as never, stubDatabaseService(), stubQuotaService(), { defaultsFor: async () => undefined } as never);
  setConfig('ai.openrouter.api.key', 'test-openrouter-key');
  setConfig('ai.openrouter.api.url', 'https://openrouter.ai/api/v1');

  it('should refuse to build a client for a model absent from the registry', () => {
    expect(() => router.buildClient({ provider: 'openrouter', model: 'evil/unbounded-spend' })).toThrow();
  });

  it('should refuse a registry id pinned to a provider the router cannot serve, never rerouting it to the platform key', () => {
    expect(() => router.buildClient({ provider: 'ollama', model: 'x-ai/grok-4.6' })).toThrow();
  });
});
