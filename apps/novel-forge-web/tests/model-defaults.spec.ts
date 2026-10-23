import { describe, expect, it } from 'bun:test';

import { type AiModelOption, type AiModelsResponse, type AiTierModel } from '../src/lib/apis/api-types.gen';
import { DEFAULT_PIN, inheritedModel, modelLabel, modelPrice, pinMenu, pinUpdate } from '../src/lib/model-defaults';

const tier = (costTier: AiTierModel['costTier'], contentMode: AiTierModel['contentMode'], group: string, model: string): AiTierModel => ({
  costTier,
  contentMode,
  group,
  provider: 'openrouter',
  model,
  label: `${model} label`,
});

const TIERS = [
  tier('balanced', 'standard', 'planning', 'anthropic/claude-opus-5'),
  tier('economy', 'standard', 'planning', 'z-ai/glm-5.2'),
  tier('economy', 'unrestricted', 'planning', 'moonshotai/kimi-k3'),
];

describe('inheritedModel', () => {
  it('should inherit the platform model for the tier and model type', () => {
    expect(inheritedModel('planning', TIERS, 'balanced', 'standard')).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5', label: 'anthropic/claude-opus-5 label' });
    expect(inheritedModel('planning', TIERS, 'economy', 'standard')).toEqual({ provider: 'openrouter', model: 'z-ai/glm-5.2', label: 'z-ai/glm-5.2 label' });
    expect(inheritedModel('planning', TIERS, 'economy', 'unrestricted')).toEqual({ provider: 'openrouter', model: 'moonshotai/kimi-k3', label: 'moonshotai/kimi-k3 label' });
  });

  it('should find nothing for a group the tier map does not list', () => {
    expect(inheritedModel('writing', TIERS, 'balanced', 'standard')).toBeUndefined();
  });
});

const alias = (id: string, label: string): AiModelOption => ({ id, provider: 'synapse', label, kind: 'llm', enabled: true });

const SYNAPSE_MODELS: AiModelsResponse = {
  profile: 'production',
  models: [alias('opus', 'Opus'), alias('sonnet', 'Sonnet'), alias('grok', 'Grok')],
  defaults: [],
  unrestrictedDefaults: [],
  unrestrictedAllowlist: ['grok'],
  tiers: [],
  modelLabels: [
    { model: 'claude-opus-5.5', label: 'Claude Opus 5.5', inputPricePerMToken: 4, outputPricePerMToken: 20 },
    { model: 'anthropic/claude-opus-5', label: 'Claude Opus 5', inputPricePerMToken: 5, outputPricePerMToken: 25 },
  ],
};

const DEFAULT = { provider: 'synapse', model: 'claude-opus-5.5', label: 'Claude Opus 5.5' };
const unpinned = { modelProvider: null, modelId: null };
const OFFERED = ['opus', 'sonnet', 'grok'];

describe('modelLabel', () => {
  it('should name a pin by its option and a recorded model by the server names, falling back to the key', () => {
    expect(modelLabel(SYNAPSE_MODELS, 'opus', 'synapse')).toBe('Opus');
    expect(modelLabel(SYNAPSE_MODELS, 'claude-opus-5.5', 'subscription')).toBe('Claude Opus 5.5');
    expect(modelLabel(SYNAPSE_MODELS, 'anthropic/claude-opus-5', 'openrouter')).toBe('Claude Opus 5');
    expect(modelLabel(SYNAPSE_MODELS, 'retired-model')).toBe('retired-model');
    expect(modelLabel(SYNAPSE_MODELS, null)).toBeUndefined();
  });

  it('should price a recorded model from the server names, and say none does once they are known', () => {
    expect(modelPrice(SYNAPSE_MODELS, 'anthropic/claude-opus-5')).toMatchObject({ inputPricePerMToken: 5, outputPricePerMToken: 25 });
    expect(modelPrice(SYNAPSE_MODELS, 'unknown')).toBeNull();
    expect(modelPrice(undefined, 'unknown')).toBeUndefined();
  });
});

describe('pinMenu', () => {
  it('should list the alias labels after the default, which names the model it resolves to', () => {
    const menu = pinMenu(SYNAPSE_MODELS, unpinned, OFFERED, DEFAULT);

    expect(menu.choices.map(choice => choice.label)).toEqual(['Opus', 'Sonnet', 'Grok']);
    expect(menu.defaultLabel).toBe('Default · Claude Opus 5.5');
    expect(menu.triggerLabel).toBe('Default · Claude Opus 5.5');
    expect(menu.value).toBe(DEFAULT_PIN);
  });

  it("should offer only the aliases of the chat's own selection, never the union across tiers", () => {
    expect(pinMenu(SYNAPSE_MODELS, unpinned, ['grok'], DEFAULT).choices.map(choice => choice.label)).toEqual(['Grok']);
  });

  it("should list only the default until the selection's offer has loaded, while still naming a stored pin", () => {
    const menu = pinMenu(SYNAPSE_MODELS, { modelProvider: 'synapse', modelId: 'opus' }, undefined, DEFAULT);

    expect(menu.choices).toEqual([]);
    expect(menu.triggerLabel).toBe('Opus');
  });

  it('should show a pinned chat by its alias label and select its option', () => {
    const menu = pinMenu(SYNAPSE_MODELS, { modelProvider: 'synapse', modelId: 'sonnet' }, OFFERED, DEFAULT);

    expect(menu.triggerLabel).toBe('Sonnet');
    expect(menu.choices.find(choice => choice.value === menu.value)?.label).toBe('Sonnet');
  });

  it('should say only Default before the tier map has loaded', () => {
    expect(pinMenu(undefined, undefined, undefined).defaultLabel).toBe('Default');
  });
});

describe('pinUpdate', () => {
  it('should send the picked alias key with the synapse provider, and both null for the default', () => {
    const [opus] = pinMenu(SYNAPSE_MODELS, unpinned, OFFERED, DEFAULT).choices;

    expect(pinUpdate(opus?.value ?? '')).toEqual({ provider: 'synapse', model: 'opus' });
    expect(pinUpdate(DEFAULT_PIN)).toEqual({ provider: null, model: null });
  });

  it('should send any option as its own provider and model', () => {
    const other: AiModelsResponse = { ...SYNAPSE_MODELS, models: [{ id: 'anthropic/claude-opus-5', provider: 'openrouter', label: 'Claude Opus 5', kind: 'llm', enabled: true }] };
    const [opus] = pinMenu(other, unpinned, ['anthropic/claude-opus-5']).choices;

    expect(pinUpdate(opus?.value ?? '')).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });
  });
});
