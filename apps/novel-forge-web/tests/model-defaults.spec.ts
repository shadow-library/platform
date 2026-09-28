import { describe, expect, it } from 'bun:test';

import { type AiTierModel } from '../src/lib/apis/api-types.gen';
import { inheritedModel, modelSaveBody } from '../src/lib/model-defaults';

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

describe('modelSaveBody', () => {
  const opus = { provider: 'anthropic', model: 'claude-opus' };
  const glm = { provider: 'openrouter', model: 'glm' };
  const picks = [
    { roles: ['generation', 'revision'] as const, ref: opus },
    { roles: ['chat'] as const, ref: glm },
    { roles: ['title'] as const, ref: null },
  ];

  it('should send only the mode and tier while the registry is missing, leaving every stored pick alone', () => {
    expect(modelSaveBody({ contentMode: 'unrestricted', costTier: 'economy', picks })).toEqual({ contentMode: 'unrestricted', costTier: 'economy' });
  });

  it('should fan each pick out over its roles once the registry is loaded', () => {
    expect(modelSaveBody({ contentMode: 'standard', costTier: 'balanced', unrestrictedAllowlist: ['glm'], picks })).toEqual({
      contentMode: 'standard',
      costTier: 'balanced',
      config: { models: { generation: opus, revision: opus, chat: glm } },
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
