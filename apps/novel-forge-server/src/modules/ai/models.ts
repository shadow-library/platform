type ModelProvider = 'openrouter' | 'ollama';
export type ReasoningEffort = 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'none';

interface ReasoningSpec {
  /** `mandatory` models always reason and can only be clamped; `optional` models reason unless the request omits the field. */
  mode: 'none' | 'optional' | 'mandatory';
  /** Efforts OpenRouter accepts for this model, ordered highest to lowest — the clamp reads the last entry as the floor. */
  efforts?: ReasoningEffort[];
}

interface ModelEntryBase {
  id: string;
  provider: ModelProvider;
  contextWindow?: number;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  reasoning?: ReasoningSpec;
  /** Max reference images the model honours per request; absent or 0 means unsupported. */
  maxInputReferences?: number;
  /** Whether a chat call may carry an `image_url` content part — set only where OpenRouter's `architecture.input_modalities` lists `image`. */
  supportsImageInput?: boolean;
}

/** A model an author can pick. `label` is the product name on its own — never the gateway, the vendor prefix, or the slug. */
interface SelectableModelEntry extends ModelEntryBase {
  kind: 'llm' | 'image';
  label: string;
}

/** Pinned to the pgvector column width and never offered in a picker, so it carries no display name. */
interface EmbeddingModelEntry extends ModelEntryBase {
  kind: 'embedding';
}

export type ModelEntry = SelectableModelEntry | EmbeddingModelEntry;

// All supported models. New entries land here; the router validates against this registry. Every LLM
// id is an OpenRouter `vendor/model` slug — the gateway every chat call goes through.
export const MODEL_REGISTRY: ModelEntry[] = [
  // xAI / Grok LLMs
  {
    id: 'x-ai/grok-4.6',
    label: 'Grok 4.6',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 500000,
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 6.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'mandatory', efforts: ['xhigh', 'high', 'medium', 'low'] },
  },
  {
    id: 'x-ai/grok-4.3',
    label: 'Grok 4.3',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1000000,
    inputPricePerMToken: 1.25,
    outputPricePerMToken: 2.5,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['high', 'medium', 'low', 'none'] },
  },
  // xAI image. OpenRouter's per-model `/endpoints` metadata confirms image input support but documents no reference-count limit, so 1 is the conservative floor.
  { id: 'x-ai/grok-imagine-image-2.0', label: 'Grok Imagine Image 2.0', provider: 'openrouter', kind: 'image', maxInputReferences: 1 },
  // Anthropic
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1000000,
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 10.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['max', 'high', 'medium', 'low'] },
  },
  {
    id: 'anthropic/claude-opus-5',
    label: 'Claude Opus 5',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1000000,
    inputPricePerMToken: 5.0,
    outputPricePerMToken: 25.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['max', 'high', 'medium', 'low'] },
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 200000,
    inputPricePerMToken: 1.0,
    outputPricePerMToken: 5.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional' },
  },
  // OpenAI
  {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 15.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['xhigh', 'high', 'medium', 'low', 'none'] },
  },
  {
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 0.2,
    outputPricePerMToken: 1.2,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['max', 'high', 'medium', 'low', 'none'] },
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 2.0,
    outputPricePerMToken: 10.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['max', 'high', 'medium', 'low', 'none'] },
  },
  {
    id: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 400000,
    inputPricePerMToken: 0.75,
    outputPricePerMToken: 4.5,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['xhigh', 'high', 'medium', 'low', 'none'] },
  },
  // OpenAI image. Confirms image input support the same way, again with no documented reference-count cap.
  { id: 'openai/gpt-5.4-image-2', label: 'GPT-5.4 Image 2', provider: 'openrouter', kind: 'image', maxInputReferences: 1 },
  // Moonshot AI
  {
    id: 'moonshotai/kimi-k3',
    label: 'Kimi K3',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1000000,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional', efforts: ['max', 'high', 'low'] },
  },
  {
    id: 'moonshotai/kimi-k2.6',
    label: 'Kimi K2.6',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 262000,
    inputPricePerMToken: 0.54,
    outputPricePerMToken: 2.28,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'optional' },
  },
  // Z.AI
  {
    id: 'z-ai/glm-5.2',
    label: 'GLM 5.2',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 0.97,
    outputPricePerMToken: 3.04,
    supportsTools: true,
    supportsStructuredOutput: true,
    reasoning: { mode: 'optional', efforts: ['xhigh', 'high'] },
  },
  {
    id: 'z-ai/glm-5.3',
    label: 'GLM 5.3',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 1.4,
    outputPricePerMToken: 4.4,
    supportsTools: true,
    supportsStructuredOutput: true,
    reasoning: { mode: 'mandatory', efforts: ['max', 'high', 'low'] },
  },
  // DeepSeek
  {
    id: 'deepseek/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 0.41,
    outputPricePerMToken: 0.83,
    supportsTools: true,
    supportsStructuredOutput: true,
    reasoning: { mode: 'optional', efforts: ['xhigh', 'high'] },
  },
  // Google
  {
    id: 'google/gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    provider: 'openrouter',
    kind: 'llm',
    contextWindow: 1050000,
    inputPricePerMToken: 0.375,
    outputPricePerMToken: 1.875,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsImageInput: true,
    reasoning: { mode: 'mandatory', efforts: ['high', 'medium', 'low'] },
  },
  // The only local model left: `EmbeddingService` calls Ollama directly, and the pgvector columns are
  // sized to this model's 1024 dimensions. No chat call ever routes to `ollama`.
  { id: 'qwen3-embedding:8b', provider: 'ollama', kind: 'embedding' },
];

export const MODEL_MAP: Record<string, ModelEntry> = Object.fromEntries(MODEL_REGISTRY.map(m => [m.id, m]));
