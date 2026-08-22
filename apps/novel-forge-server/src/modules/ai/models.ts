export type ModelKind = 'llm' | 'embedding' | 'image';
export type ModelProvider = 'openrouter' | 'ollama';
// Image models never reach the router: IllustrationService posts to the vendor endpoint directly with
// its own credential, so these name the vendor rather than a routed provider.
export type ImageProvider = 'xai' | 'openai';

export interface ModelEntry {
  id: string;
  provider: ModelProvider | ImageProvider;
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
    id: 'x-ai/grok-3',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 131072,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'x-ai/grok-3-mini',
    provider: 'openrouter',
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
    id: 'anthropic/claude-sonnet-4.6',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 200000,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
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
    id: 'openai/gpt-4o',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 128000,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10.0,
    supportsTools: true,
    supportsStructuredOutput: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openrouter',
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
