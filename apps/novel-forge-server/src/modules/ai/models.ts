export type ModelKind = 'llm' | 'embedding' | 'image';
export type ModelProvider = 'openrouter' | 'ollama';

export interface ModelEntry {
  id: string;
  provider: ModelProvider;
  kind: ModelKind;
  contextWindow?: number;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
}

// All supported models. New entries land here; the router validates against this registry. Every LLM
// id is an OpenRouter `vendor/model` slug — the gateway every hosted chat call goes through.
export const MODEL_REGISTRY: ModelEntry[] = [
  // xAI / Grok LLMs
  {
    id: 'x-ai/grok-4.6',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 500000,
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 6.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  // xAI image
  { id: 'x-ai/grok-imagine-image-2.0', provider: 'openrouter', kind: 'image' },
  // Anthropic
  {
    id: 'anthropic/claude-sonnet-5',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1000000,
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 10.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 200000,
    inputPricePerMToken: 1.0,
    outputPricePerMToken: 5.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  // OpenAI
  {
    id: 'openai/gpt-5.4',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 15.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'openai/gpt-5.6-luna',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 0.2,
    outputPricePerMToken: 1.2,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'openai/gpt-5.4-mini',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 400000,
    inputPricePerMToken: 0.75,
    outputPricePerMToken: 4.5,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  { id: 'openai/gpt-5.4-image-2', provider: 'openrouter', kind: 'image' },
  // Ollama (local — no pricing, variable context)
  { id: 'qwen3:14b', provider: 'ollama', kind: 'llm', supportsTools: false, supportsStructuredOutput: false },
  { id: 'qwen3:8b', provider: 'ollama', kind: 'llm', supportsTools: false, supportsStructuredOutput: false },
  { id: 'qwen3-embedding:8b', provider: 'ollama', kind: 'embedding' },
];

export const MODEL_MAP: Record<string, ModelEntry> = Object.fromEntries(MODEL_REGISTRY.map(m => [m.id, m]));
