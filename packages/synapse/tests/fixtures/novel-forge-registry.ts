/** Copied from apps/novel-forge-server/src/modules/ai/models.ts `MODEL_REGISTRY` as it stood when Synapse replaced it; packages never import apps */
export const REGISTRY_LLM_SLUGS = [
  'x-ai/grok-4.6',
  'x-ai/grok-4.3',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.4',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.4-mini',
  'moonshotai/kimi-k3',
  'moonshotai/kimi-k2.6',
  'z-ai/glm-5.2',
  'z-ai/glm-5.3',
  'deepseek/deepseek-v4-pro',
  'google/gemini-3.7-flash',
];

export const REGISTRY_NON_LLM_SLUGS = ['x-ai/grok-imagine-image-2.0', 'openai/gpt-5.4-image-2', 'qwen3-embedding:0.6b'];

/** The seed catalog's alias keys (synapse plan §8) */
export const SEED_ALIAS_KEYS = ['opus', 'sonnet', 'haiku', 'grok', 'gpt-sol', 'gpt-luna', 'gpt', 'gpt-mini', 'kimi', 'glm', 'deepseek', 'gemini-flash'];
