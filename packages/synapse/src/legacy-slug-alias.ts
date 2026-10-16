/** A null prototype keeps `toString` and friends from reading as a mapped slug */
export const LEGACY_SLUG_ALIAS: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    'anthropic/claude-opus-5.5': 'opus',
    'anthropic/claude-opus-5': 'opus',
    'anthropic/claude-sonnet-5': 'sonnet',
    'anthropic/claude-haiku-4.5': 'haiku',
    'x-ai/grok-4.6': 'grok',
    'x-ai/grok-4.3': 'grok',
    'openai/gpt-5.6-sol': 'gpt-sol',
    'openai/gpt-5.6-luna': 'gpt-luna',
    'openai/gpt-5.4': 'gpt',
    'openai/gpt-5.4-mini': 'gpt-mini',
    'moonshotai/kimi-k3': 'kimi',
    'moonshotai/kimi-k2.6': 'kimi',
    'z-ai/glm-5.3': 'glm',
    'z-ai/glm-5.2': 'glm',
    'deepseek/deepseek-v4-pro': 'deepseek',
    'google/gemini-3.7-flash': 'gemini-flash',
  }),
);
