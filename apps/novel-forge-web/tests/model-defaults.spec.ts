import { describe, expect, it } from 'bun:test';

import { type AiModelOption } from '../src/lib/apis/api-types.gen';
import { modelLabel } from '../src/lib/model-defaults';

const alias = (id: string, label: string): AiModelOption => ({ id, provider: 'synapse', label, kind: 'llm', enabled: true });

const NAMES = {
  models: [alias('deep', 'Deep alias'), alias('quick', 'Quick alias')],
  modelLabels: [
    { model: 'vendor/model-a', label: 'Model A', inputPricePerMToken: 4, outputPricePerMToken: 20 },
    { model: 'vendor/model-b', label: 'Model B', inputPricePerMToken: 5, outputPricePerMToken: 25 },
  ],
};

describe('modelLabel', () => {
  it('should name an alias by its option and a recorded model by the catalog names, falling back to the key', () => {
    expect(modelLabel(NAMES, 'deep', 'synapse')).toBe('Deep alias');
    expect(modelLabel(NAMES, 'vendor/model-a', 'subscription')).toBe('Model A');
    expect(modelLabel(NAMES, 'vendor/model-b', 'openrouter')).toBe('Model B');
    expect(modelLabel(NAMES, 'retired-model')).toBe('retired-model');
    expect(modelLabel(NAMES, null)).toBeUndefined();
  });

  it('should fall back to the key before the catalog has loaded', () => {
    expect(modelLabel(undefined, 'vendor/model-a')).toBe('vendor/model-a');
  });
});
