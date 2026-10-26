import { type SynapseEnvelope } from '@shadow-library/synapse';

import { type ModelSpec, type ProviderSpec } from '@modules/catalog';

export type JsonObject = Record<string, unknown>;

export type ProviderFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ChatContentPart {
  type: string;
  text?: string;
  image_url?: unknown;
  cache_control?: unknown;
}

export interface ChatMessage {
  role: string;
  content?: string | ChatContentPart[] | null;
  name?: string;
  tool_calls?: unknown;
  tool_call_id?: string;
  cache_control?: unknown;
}

export interface JsonSchemaResponseFormat {
  type: 'json_schema';
  json_schema: { name?: string; description?: string; schema?: JsonObject; strict?: boolean };
}

export type ResponseFormat = JsonSchemaResponseFormat | { type: 'json_object' } | { type: 'text' };

/** The OpenAI Chat Completions body an app sends, `model` naming the task */
export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
  stream?: boolean;
  stream_options?: JsonObject;
  response_format?: ResponseFormat;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  seed?: number;
  synapse?: SynapseEnvelope;
}

export interface EmbeddingRequestBody {
  model: string;
  input: string | string[];
  synapse?: SynapseEnvelope;
}

export interface ImageRequestBody {
  model: string;
  prompt: string;
  n?: number;
  reference_images?: string[];
  synapse?: SynapseEnvelope;
}

export interface TranslatedRequest {
  url: string;
  headers: Record<string, string>;
  body: JsonObject;
  /** Set only when the envelope asked for web search: whether this deployment will run it */
  webSearch?: boolean;
  /** Synapse runs the search itself: the body offers its tool, and dispatch answers each call before asking again */
  hostedSearch?: boolean;
}

export interface NormalizedUsage {
  /** Every prompt token, the cached ones included */
  inputTokens: number;
  cachedInputTokens: number;
  /** Every completion token, the reasoning ones included */
  outputTokens: number;
  reasoningTokens: number;
  /** What the upstream says the call cost; on the gateway, what it would have cost on the vendor's API */
  upstreamCostUsd?: number;
}

export interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: number };
  completion_tokens_details: { reasoning_tokens: number };
}

export interface GeneratedImage {
  b64_json: string;
  media_type: string;
}

export interface ProviderTarget {
  providerKey: string;
  provider: ProviderSpec;
  deploymentId: string;
  model: ModelSpec;
}
