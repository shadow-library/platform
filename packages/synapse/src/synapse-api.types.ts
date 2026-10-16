import { type SynapseEnvelope, type SynapseResponseBlock } from './synapse.types';

export type SynapseEnvelopeInput = Omit<SynapseEnvelope, 'request_id'> & { request_id?: string };

export interface SynapseCallOptions {
  signal?: AbortSignal;
}

export interface SynapseTextPart {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface SynapseImagePart {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export type SynapseContentPart = SynapseTextPart | SynapseImagePart;

export interface SynapseToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface SynapseChatMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content?: string | SynapseContentPart[] | null;
  name?: string;
  tool_calls?: SynapseToolCall[];
  tool_call_id?: string;
}

export interface SynapseTool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };
}

export type SynapseToolChoice = 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };

export type SynapseResponseFormat =
  { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: { name: string; description?: string; schema?: Record<string, unknown>; strict?: boolean } };

export interface SynapseChatRequest {
  model: string;
  messages: SynapseChatMessage[];
  tools?: SynapseTool[];
  tool_choice?: SynapseToolChoice;
  stream_options?: { include_usage?: boolean };
  response_format?: SynapseResponseFormat;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  seed?: number;
  synapse: SynapseEnvelopeInput;
}

export interface SynapseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface SynapseAssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: SynapseToolCall[];
  refusal?: string | null;
}

export interface SynapseChatChoice {
  index: number;
  message: SynapseAssistantMessage;
  finish_reason: string | null;
}

export interface SynapseChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: SynapseChatChoice[];
  usage?: SynapseUsage;
  synapse: SynapseResponseBlock;
}

export interface SynapseChunkToolCall {
  index: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

export interface SynapseChunkChoice {
  index: number;
  delta: { role?: 'assistant'; content?: string | null; tool_calls?: SynapseChunkToolCall[]; refusal?: string | null };
  finish_reason: string | null;
}

export interface SynapseChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: SynapseChunkChoice[];
  usage?: SynapseUsage | null;
}

export interface SynapseStreamFinal {
  usage: SynapseUsage | null;
  synapse: SynapseResponseBlock;
}

export interface SynapseEmbeddingRequest {
  model: string;
  input: string | string[];
  synapse: SynapseEnvelopeInput;
}

export interface SynapseEmbedding {
  object: 'embedding';
  index: number;
  embedding: number[];
}

export interface SynapseEmbeddingResponse {
  object: 'list';
  data: SynapseEmbedding[];
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
  synapse: SynapseResponseBlock;
}

export interface SynapseImageRequest {
  model: string;
  prompt: string;
  n?: number;
  reference_images?: string[];
  synapse: SynapseEnvelopeInput;
}

export interface SynapseImage {
  b64_json: string;
  media_type: string;
}

export interface SynapseImageResponse {
  data: SynapseImage[];
  usage?: { cost?: number };
  synapse: SynapseResponseBlock;
}

export interface CatalogQuery {
  task?: string;
  selectors?: Record<string, string>;
}
