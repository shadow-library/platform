import { describe, expect, it } from 'bun:test';

import { type AiTierModel } from '../src/lib/apis/api-types.gen';
import { inheritedModel } from '../src/lib/model-defaults';

const tier = (costTier: AiTierModel['costTier'], contentMode: AiTierModel['contentMode'], group: string, model: string): AiTierModel => ({
  costTier,
  contentMode,
  group,
  provider: 'openrouter',
  model,
  label: model,
});

const TIERS = [
  tier('balanced', 'standard', 'planning', 'anthropic/claude-opus-5'),
  tier('economy', 'standard', 'planning', 'z-ai/glm-5.2'),
  tier('economy', 'unrestricted', 'planning', 'moonshotai/kimi-k3'),
];

describe('inheritedModel', () => {
  it('should inherit the platform model for the tier and model type', () => {
    expect(inheritedModel('planning', TIERS, 'balanced', 'standard')).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });
    expect(inheritedModel('planning', TIERS, 'economy', 'standard')).toEqual({ provider: 'openrouter', model: 'z-ai/glm-5.2' });
    expect(inheritedModel('planning', TIERS, 'economy', 'unrestricted')).toEqual({ provider: 'openrouter', model: 'moonshotai/kimi-k3' });
  });

  it('should find nothing for a group the tier map does not list', () => {
    expect(inheritedModel('writing', TIERS, 'balanced', 'standard')).toBeUndefined();
  });
});
