export interface HistoricalModel {
  label: string;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
}

/**
 * The OpenRouter models novel-forge called directly before Synapse routed every call, keyed by the slug their `model_calls` rows hold: the
 * name such a row is shown under, and the list price that estimates the cost of one that recorded none. Never a routing input.
 */
export const HISTORICAL_MODELS: Readonly<Record<string, HistoricalModel>> = {
  'x-ai/grok-4.6': { label: 'Grok 4.6', inputPricePerMToken: 2.0, outputPricePerMToken: 6.0 },
  'x-ai/grok-4.3': { label: 'Grok 4.3', inputPricePerMToken: 1.25, outputPricePerMToken: 2.5 },
  'x-ai/grok-imagine-image-2.0': { label: 'Grok Imagine Image 2.0' },
  'anthropic/claude-sonnet-5': { label: 'Claude Sonnet 5', inputPricePerMToken: 2.0, outputPricePerMToken: 10.0 },
  'anthropic/claude-opus-5.5': { label: 'Claude Opus 5.5', inputPricePerMToken: 4.0, outputPricePerMToken: 20.0 },
  'anthropic/claude-opus-5': { label: 'Claude Opus 5', inputPricePerMToken: 5.0, outputPricePerMToken: 25.0 },
  'anthropic/claude-haiku-4.5': { label: 'Claude Haiku 4.5', inputPricePerMToken: 1.0, outputPricePerMToken: 5.0 },
  'openai/gpt-5.4': { label: 'GPT-5.4', inputPricePerMToken: 2.5, outputPricePerMToken: 15.0 },
  'openai/gpt-5.6-luna': { label: 'GPT-5.6 Luna', inputPricePerMToken: 0.2, outputPricePerMToken: 1.2 },
  'openai/gpt-5.6-sol': { label: 'GPT-5.6 Sol', inputPricePerMToken: 2.0, outputPricePerMToken: 10.0 },
  'openai/gpt-5.4-mini': { label: 'GPT-5.4 Mini', inputPricePerMToken: 0.75, outputPricePerMToken: 4.5 },
  'openai/gpt-5.4-image-2': { label: 'GPT-5.4 Image 2' },
  'moonshotai/kimi-k3': { label: 'Kimi K3', inputPricePerMToken: 3.0, outputPricePerMToken: 15.0 },
  'moonshotai/kimi-k2.6': { label: 'Kimi K2.6', inputPricePerMToken: 0.54, outputPricePerMToken: 2.28 },
  'z-ai/glm-5.2': { label: 'GLM 5.2', inputPricePerMToken: 0.97, outputPricePerMToken: 3.04 },
  'z-ai/glm-5.3': { label: 'GLM 5.3', inputPricePerMToken: 1.4, outputPricePerMToken: 4.4 },
  'deepseek/deepseek-v4-pro': { label: 'DeepSeek V4 Pro', inputPricePerMToken: 0.41, outputPricePerMToken: 0.83 },
  'google/gemini-3.7-flash': { label: 'Gemini 3.7 Flash', inputPricePerMToken: 0.375, outputPricePerMToken: 1.875 },
};
