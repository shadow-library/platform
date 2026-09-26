import { describe, expect, it } from 'bun:test';

import { type AiModelOption } from '../src/lib/apis/api-types.gen';
import { inheritedModel, modelSaveBody } from '../src/lib/model-defaults';

const option = (id: string): AiModelOption => ({ id, provider: 'openrouter', label: id, kind: 'llm', enabled: true });

const REGISTRY = [option('anthropic/claude-opus-5'), option('z-ai/glm-5.2')];
const PLATFORM = [{ role: 'planning', provider: 'openrouter', model: 'anthropic/claude-opus-5' }];

describe('inheritedModel', () => {
  it('should prefer the author’s own default', () => {
    expect(inheritedModel('planning', { planning: { provider: 'openrouter', model: 'z-ai/glm-5.2' } }, PLATFORM, REGISTRY)).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-5.2',
      source: 'account',
    });
  });

  it('should fall back to the platform default when the author set none', () => {
    expect(inheritedModel('planning', {}, PLATFORM, REGISTRY)).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5', source: 'platform' });
  });

  it('should skip an own default the registry no longer lists', () => {
    expect(inheritedModel('planning', { planning: { provider: 'openrouter', model: 'retired/model' } }, PLATFORM, REGISTRY)?.source).toBe('platform');
  });

  it('should skip an own default the unrestricted allowlist refuses', () => {
    const own = { planning: { provider: 'openrouter', model: 'anthropic/claude-opus-5' } };
    expect(inheritedModel('planning', own, PLATFORM, REGISTRY, new Set(['z-ai/glm-5.2']))?.source).toBe('platform');
  });

  it('should find nothing for a group with no platform default and no own default', () => {
    expect(inheritedModel('writing', undefined, PLATFORM, REGISTRY)).toBeUndefined();
  });
});

describe('modelSaveBody', () => {
  const opus = { provider: 'anthropic', model: 'claude-opus' };
  const glm = { provider: 'openrouter', model: 'glm' };
  const embedding = { provider: 'openai', model: 'embed' };
  const picks = [
    { roles: ['generation', 'revision'] as const, ref: opus },
    { roles: ['chat'] as const, ref: glm },
    { roles: ['title'] as const, ref: null },
  ];

  it('should send only the mode and tier while the registry is missing, leaving every stored pick alone', () => {
    expect(modelSaveBody({ contentMode: 'unrestricted', costTier: 'economy', picks, embedding })).toEqual({ contentMode: 'unrestricted', costTier: 'economy' });
  });

  it('should fan each pick out over its roles and keep the locked embedding once the registry is loaded', () => {
    expect(modelSaveBody({ contentMode: 'standard', costTier: 'balanced', unrestrictedAllowlist: ['glm'], picks, embedding })).toEqual({
      contentMode: 'standard',
      costTier: 'balanced',
      config: { models: { embedding, generation: opus, revision: opus, chat: glm } },
    });
  });

  it('should drop picks an unrestricted novel may not use', () => {
    expect(modelSaveBody({ contentMode: 'unrestricted', costTier: 'balanced', unrestrictedAllowlist: ['glm'], picks })).toEqual({
      contentMode: 'unrestricted',
      costTier: 'balanced',
      config: { models: { chat: glm } },
    });
  });
});
