export type ModelKind = 'llm' | 'embedding' | 'image';
export type ModelProvider = 'anthropic' | 'openai' | 'xai' | 'ollama';

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

// All supported models. New entries land here; the router validates against this registry.
export const MODEL_REGISTRY: ModelEntry[] = [
  // xAI / Grok LLMs
  { id: 'grok-3', provider: 'xai', kind: 'llm', contextWindow: 131072, inputPricePerMToken: 3.0, outputPricePerMToken: 15.0, supportsTools: true, supportsStructuredOutput: true },
  {
    id: 'grok-3-mini',
    provider: 'xai',
    kind: 'llm',
    contextWindow: 131072,
    inputPricePerMToken: 0.3,
    outputPricePerMToken: 0.5,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  // xAI image
  { id: 'grok-2-image', provider: 'xai', kind: 'image' },
  // Anthropic
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    kind: 'llm',
    contextWindow: 200000,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    kind: 'llm',
    contextWindow: 200000,
    inputPricePerMToken: 0.8,
    outputPricePerMToken: 4.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  // OpenAI
  {
    id: 'gpt-4o',
    provider: 'openai',
    kind: 'llm',
    contextWindow: 128000,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    kind: 'llm',
    contextWindow: 128000,
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  { id: 'gpt-image-1', provider: 'openai', kind: 'image' },
  // Ollama (local — no pricing, variable context)
  { id: 'qwen3:14b', provider: 'ollama', kind: 'llm', supportsTools: false, supportsStructuredOutput: false },
  { id: 'qwen3:8b', provider: 'ollama', kind: 'llm', supportsTools: false, supportsStructuredOutput: false },
  { id: 'qwen3-embedding:8b', provider: 'ollama', kind: 'embedding' },
];

export const MODEL_MAP: Record<string, ModelEntry> = Object.fromEntries(MODEL_REGISTRY.map(m => [m.id, m]));
