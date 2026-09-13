import { describe, expect, it } from 'bun:test';

import { type AiModelOption } from '../src/lib/apis/api-types.gen';
import { inheritedModel } from '../src/lib/model-defaults';

const option = (id: string): AiModelOption => ({ id, provider: 'openrouter', label: id, kind: 'llm', enabled: true });

const REGISTRY = [option('anthropic/claude-opus-5'), option('z-ai/glm-5.2')];
const PLATFORM = [{ role: 'ideation', provider: 'openrouter', model: 'anthropic/claude-opus-5' }];

describe('inheritedModel', () => {
  it('should prefer the author’s own default', () => {
    expect(inheritedModel('ideation', { ideation: { provider: 'openrouter', model: 'z-ai/glm-5.2' } }, PLATFORM, REGISTRY)).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-5.2',
      source: 'account',
    });
  });

  it('should fall back to the platform default when the author set none', () => {
    expect(inheritedModel('ideation', {}, PLATFORM, REGISTRY)).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5', source: 'platform' });
  });

  it('should skip an own default the registry no longer lists', () => {
    expect(inheritedModel('ideation', { ideation: { provider: 'openrouter', model: 'retired/model' } }, PLATFORM, REGISTRY)?.source).toBe('platform');
  });

  it('should skip an own default the unrestricted allowlist refuses', () => {
    const own = { ideation: { provider: 'openrouter', model: 'anthropic/claude-opus-5' } };
    expect(inheritedModel('ideation', own, PLATFORM, REGISTRY, new Set(['z-ai/glm-5.2']))?.source).toBe('platform');
  });

  it('should find nothing for a group with no platform default and no own default', () => {
    expect(inheritedModel('writing', undefined, PLATFORM, REGISTRY)).toBeUndefined();
  });
});
