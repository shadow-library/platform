import { type SynapseEnvelope } from '@shadow-library/synapse';

import { type Effort, type ModelSpec, type ProviderFlavor, type ProviderSpec } from '@modules/catalog';

import { ProviderCallError } from './provider-call.error';
import { optionalPropertyCount } from './schema-complexity.util';
import {
  type ChatContentPart,
  type ChatMessage,
  type ChatRequestBody,
  type EmbeddingRequestBody,
  type ImageRequestBody,
  type JsonObject,
  type TranslatedRequest,
} from './provider.types';

export type ProviderDialect = ProviderFlavor | 'ollama' | 'mock';

export interface ChatTranslationInput {
  body: ChatRequestBody;
  model: ModelSpec;
  provider: ProviderSpec;
  providerKey: string;
  deploymentId: string;
  /** Already clamped and snapped by dispatch; `null` sends no reasoning control */
  effort: Effort | null | undefined;
  envelope: SynapseEnvelope;
  /** Resolved by the credential resolver; absent sends no authorization */
  apiKey?: string;
}

export interface EmbeddingTranslationInput {
  body: EmbeddingRequestBody;
  provider: ProviderSpec;
  providerKey: string;
  deploymentId: string;
  apiKey?: string;
}

export interface ImageTranslationInput {
  body: ImageRequestBody;
  provider: ProviderSpec;
  providerKey: string;
  deploymentId: string;
  apiKey?: string;
}

export const GATEWAY_SESSION_HEADER = 'x-gateway-session';
export const GATEWAY_WEB_TOOLS_HEADER = 'x-gateway-web-tools';
export const JSON_SCHEMA_INSTRUCTION = 'Respond with only a JSON object that matches this JSON Schema: ';

export const VISIBLE_ASCII = /^[\x21-\x7e]+$/;
const MAX_SESSION_LENGTH = 256;
const SAMPLING_FIELDS = ['temperature', 'top_p', 'top_k', 'min_p', 'seed', 'stop', 'frequency_penalty', 'presence_penalty', 'repetition_penalty'];
/** Provider dialect is Synapse's alone: an app's own copy of these never reaches an upstream */
const DIALECT_FIELDS = ['synapse', 'reasoning', 'reasoning_effort', 'plugins', 'format'];

function baseUrl(provider: ProviderSpec): string {
  return provider.url.replace(/\/+$/, '');
}

function hasFeature(provider: ProviderSpec, feature: 'sessions' | 'native_web_search'): boolean {
  return provider.features?.includes(feature) ?? false;
}

export function providerDialect(provider: ProviderSpec, providerKey: string): ProviderDialect {
  if (provider.kind !== 'openai') return provider.kind;
  if (provider.flavor) return provider.flavor;
  throw new ProviderCallError({ retryable: false, code: 'unsupported', message: `Provider '${providerKey}' is of kind openai but names no flavor` });
}

function endpoint(provider: ProviderSpec, path: string): string {
  return provider.kind === 'ollama' ? `${baseUrl(provider)}/v1/${path}` : `${baseUrl(provider)}/${path}`;
}

// Bun's fetch rejects a header it cannot carry with a TypeError that quotes the value, so a malformed key must never reach it.
function authHeaders(provider: ProviderSpec, providerKey: string, apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (provider.kind === 'ollama' || apiKey === undefined) return headers;
  if (!VISIBLE_ASCII.test(apiKey)) throw new ProviderCallError({ retryable: false, code: 'invalid_api_key', message: `Provider '${providerKey}' has a key no header can carry` });
  headers['authorization'] = `Bearer ${apiKey}`;
  return headers;
}

function sessionHeader(session: string): string {
  if (session.length <= MAX_SESSION_LENGTH && VISIBLE_ASCII.test(session)) return session;
  throw new ProviderCallError({ retryable: false, code: 'invalid_session', message: `The session must be at most ${MAX_SESSION_LENGTH} visible ASCII characters` });
}

function withoutFields(source: object, fields: string[]): JsonObject {
  const copy: JsonObject = { ...source };
  for (const field of fields) delete copy[field];
  return copy;
}

function stripCacheControl(message: ChatMessage): ChatMessage {
  const { cache_control: _messageCache, ...rest } = message;
  if (!Array.isArray(rest.content)) return rest;
  return { ...rest, content: rest.content.map(({ cache_control: _partCache, ...part }): ChatContentPart => part) };
}

/** OpenRouter and the gateway read a `reasoning` object; only OpenRouter can be told `none`, and only for a model whose reasoning is optional */
function reasoningFor({ effort, model }: ChatTranslationInput, dialect: ProviderDialect): { effort: Effort } | undefined {
  if (!effort || model.capabilities.reasoning === 'none') return undefined;
  if (dialect === 'openrouter' || dialect === 'mock') return effort !== 'none' || model.capabilities.reasoning === 'optional' ? { effort } : undefined;
  return dialect === 'subscription-gateway' && effort !== 'none' ? { effort } : undefined;
}

function promptsSchema({ capabilities }: ModelSpec, schema: unknown): boolean {
  if (capabilities.structuredOutput === 'prompt') return true;
  return capabilities.maxOptionalProperties !== undefined && optionalPropertyCount(schema) > capabilities.maxOptionalProperties;
}

type WebSearchRoute = 'not_requested' | 'gateway_tools' | 'openrouter_plugin' | 'unavailable';

function webSearchRoute({ body, provider, envelope }: ChatTranslationInput, dialect: ProviderDialect): WebSearchRoute {
  if (envelope.web_search !== true) return 'not_requested';
  // The gateway grants a CLI's web tools only to a request that brings no tools of its own.
  const bringsTools = (body.tools?.length ?? 0) > 0;
  if (dialect === 'subscription-gateway' && hasFeature(provider, 'native_web_search')) return bringsTools ? 'unavailable' : 'gateway_tools';
  if (dialect === 'openrouter' && provider.cost === 'metered') return 'openrouter_plugin';
  return 'unavailable';
}

export function translateChatRequest(input: ChatTranslationInput): TranslatedRequest {
  const { body, model, provider, providerKey, deploymentId, envelope } = input;
  const dialect = providerDialect(provider, providerKey);
  const headers = authHeaders(provider, providerKey, input.apiKey);
  const translated = withoutFields(body, model.capabilities.sampling ? DIALECT_FIELDS : [...DIALECT_FIELDS, ...SAMPLING_FIELDS]);
  translated['model'] = deploymentId;

  let messages = model.capabilities.promptCache === 'anthropic' ? body.messages : body.messages.map(stripCacheControl);
  const responseFormat = body.response_format;
  if (responseFormat?.type === 'json_schema' && promptsSchema(model, responseFormat.json_schema.schema)) {
    delete translated['response_format'];
    messages = [...messages, { role: 'system', content: `${JSON_SCHEMA_INSTRUCTION}${JSON.stringify(responseFormat.json_schema.schema ?? {})}` }];
    if (dialect === 'ollama') translated['response_format'] = { type: 'json_object' };
  }
  translated['messages'] = messages;

  if (body.stream === true) translated['stream_options'] = { ...body.stream_options, include_usage: true };

  const reasoning = reasoningFor(input, dialect);
  if (reasoning) translated['reasoning'] = reasoning;

  if (dialect === 'subscription-gateway' && hasFeature(provider, 'sessions') && envelope.session) headers[GATEWAY_SESSION_HEADER] = sessionHeader(envelope.session);
  const webSearch = webSearchRoute(input, dialect);
  if (webSearch === 'gateway_tools') headers[GATEWAY_WEB_TOOLS_HEADER] = 'on';
  if (webSearch === 'openrouter_plugin') translated['plugins'] = [{ id: 'web' }];

  return { url: endpoint(provider, 'chat/completions'), headers, body: translated, ...(webSearch === 'not_requested' ? {} : { webSearch: webSearch !== 'unavailable' }) };
}

export function translateEmbeddingRequest({ body, provider, providerKey, deploymentId, apiKey }: EmbeddingTranslationInput): TranslatedRequest {
  providerDialect(provider, providerKey);
  const translated = withoutFields(body, DIALECT_FIELDS);
  translated['model'] = deploymentId;
  return { url: endpoint(provider, 'embeddings'), headers: authHeaders(provider, providerKey, apiKey), body: translated };
}

/** OpenRouter's dedicated images endpoint, which speaks its own shape rather than OpenAI's `images/generations` */
export function translateImageRequest({ body, provider, providerKey, deploymentId, apiKey }: ImageTranslationInput): TranslatedRequest {
  const dialect = providerDialect(provider, providerKey);
  const generates = dialect === 'openrouter' || dialect === 'mock';
  if (!generates) throw new ProviderCallError({ retryable: false, code: 'unsupported', message: `Provider '${providerKey}' cannot generate images` });
  const references = body.reference_images ?? [];
  const translated: JsonObject = { model: deploymentId, prompt: body.prompt, n: body.n ?? 1 };
  if (references.length > 0) translated['input_references'] = references.map(url => ({ type: 'image_url', image_url: { url } }));
  return { url: `${baseUrl(provider)}/images`, headers: authHeaders(provider, providerKey, apiKey), body: translated };
}
