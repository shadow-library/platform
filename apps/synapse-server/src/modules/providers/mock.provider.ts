import { JSON_SCHEMA_INSTRUCTION } from './chat-translation.util';
import { WEB_SEARCH_TOOL_NAME } from './hosted-search.util';
import { type JsonObject, type ProviderFetch, type ProviderTarget } from './provider.types';
import { asRecord, parseJson } from './upstream-payload.util';

const MOCK_USAGE = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
const MOCK_EMBEDDING_USAGE = { prompt_tokens: 10, total_tokens: 10 };
const DEFAULT_EMBEDDING_DIMENSIONS = 8;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_COUNT = 64;
const MAX_SCHEMA_VALUES = 1000;
const STREAM_CHUNKS = 3;
const TRANSPARENT_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** A mock deployment id may end in `?delay-ms=<n>`, e.g. `echo?delay-ms=250`, to answer only after that many milliseconds */
export function mockDelayMs(deploymentId: string): number {
  const query = deploymentId.indexOf('?');
  if (query === -1) return 0;
  const delay = Number(new URLSearchParams(deploymentId.slice(query + 1)).get('delay-ms'));
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

function resolveRef(ref: string, root: JsonObject): unknown {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((node, segment) => asRecord(node)?.[segment], root);
}

interface SchemaWalk {
  root: JsonObject;
  /** Values still allowed to be built, so a wide schema nested deep cannot blow up */
  budget: number;
}

function boundedCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, MAX_SCHEMA_COUNT) : 0;
}

function minimalItems(schema: JsonObject, walk: SchemaWalk, depth: number): unknown[] {
  const tuple = Array.isArray(schema['prefixItems']) ? schema['prefixItems'] : Array.isArray(schema['items']) ? schema['items'] : [];
  const rest = Array.isArray(schema['items']) ? undefined : schema['items'];
  const values = tuple.slice(0, MAX_SCHEMA_COUNT).map(item => minimalValue(item, walk, depth + 1));
  const missing = Math.max(boundedCount(schema['minItems']) - values.length, 0);
  return [...values, ...Array.from({ length: missing }, () => minimalValue(rest, walk, depth + 1))];
}

function minimalValue(node: unknown, walk: SchemaWalk, depth: number): unknown {
  const schema = asRecord(node);
  if (!schema || depth > MAX_SCHEMA_DEPTH || walk.budget <= 0) return null;
  walk.budget--;
  if ('const' in schema) return schema['const'];
  if (Array.isArray(schema['enum'])) return schema['enum'][0] ?? null;
  if (typeof schema['$ref'] === 'string') return minimalValue(resolveRef(schema['$ref'], walk.root), walk, depth + 1);
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) return minimalValue(options[0], walk, depth + 1);
  }

  const declared = schema['type'];
  const type = Array.isArray(declared) ? (declared.find(candidate => candidate !== 'null') ?? declared[0]) : declared;
  switch (type) {
    case 'object': {
      const properties = asRecord(schema['properties']) ?? {};
      const required = Array.isArray(schema['required']) ? schema['required'].filter((key): key is string => typeof key === 'string') : [];
      return Object.fromEntries(required.map(key => [key, minimalValue(properties[key], walk, depth + 1)]));
    }
    case 'array':
      return minimalItems(schema, walk, depth);
    case 'string':
      return 'x'.repeat(boundedCount(schema['minLength']));
    case 'integer':
    case 'number':
      return typeof schema['minimum'] === 'number' && Number.isFinite(schema['minimum']) ? schema['minimum'] : 0;
    case 'boolean':
      return false;
    default:
      return 'properties' in schema ? minimalValue({ ...schema, type: 'object' }, walk, depth) : null;
  }
}

/** The smallest value a JSON Schema accepts by its required properties alone; deterministic and rule-light, for a mock only, and never throws */
export function minimalForSchema(schema: JsonObject): unknown {
  try {
    return minimalValue(schema, { root: schema, budget: MAX_SCHEMA_VALUES }, 0);
  } catch {
    return null;
  }
}

function promptedSchema(messages: unknown): JsonObject | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (const message of [...messages].reverse()) {
    const content = asRecord(message)?.['content'];
    if (typeof content === 'string' && content.startsWith(JSON_SCHEMA_INSTRUCTION)) return asRecord(parseJson(content.slice(JSON_SCHEMA_INSTRUCTION.length)));
  }
  return undefined;
}

/** `{"ok":true}`, or the minimal object of the requested schema, whether it was sent natively or injected into the prompt */
export function mockAnswer(body: JsonObject): string {
  const format = asRecord(body['response_format']);
  const native = format?.['type'] === 'json_schema' ? asRecord(asRecord(format['json_schema'])?.['schema']) : undefined;
  const schema = native ?? promptedSchema(body['messages']);
  return JSON.stringify(schema ? minimalForSchema(schema) : { ok: true });
}

function splitInto(text: string, parts: number): string[] {
  const size = Math.ceil(text.length / parts);
  return Array.from({ length: parts }, (_, index) => text.slice(index * size, (index + 1) * size));
}

/** Synapse's own search tool, offered to a mock that has not searched yet: the mock searches once, for the user's last words, before answering */
function mockSearch(body: JsonObject): { id: string; type: 'function'; function: { name: string; arguments: string } } | undefined {
  const offered = Array.isArray(body['tools']) && body['tools'].some(tool => asRecord(asRecord(tool)?.['function'])?.['name'] === WEB_SEARCH_TOOL_NAME);
  const messages = Array.isArray(body['messages']) ? body['messages'].map(asRecord) : [];
  if (!offered || body['tool_choice'] === 'none' || messages.some(message => message?.['role'] === 'tool')) return undefined;
  const asked = [...messages].reverse().find(message => message?.['role'] === 'user')?.['content'];
  const query = typeof asked === 'string' && asked.trim() ? asked.trim().slice(0, 100) : 'mock search';
  return { id: 'call_mock_search', type: 'function', function: { name: WEB_SEARCH_TOOL_NAME, arguments: JSON.stringify({ query }) } };
}

function mockCompletion(body: JsonObject): JsonObject {
  const search = mockSearch(body);
  const choice = search
    ? { index: 0, message: { role: 'assistant', content: null, tool_calls: [search] }, finish_reason: 'tool_calls' }
    : { index: 0, message: { role: 'assistant', content: mockAnswer(body) }, finish_reason: 'stop' };
  return { id: 'chatcmpl-mock', object: 'chat.completion', created: 0, model: body['model'], choices: [choice], usage: MOCK_USAGE };
}

function mockStream(body: JsonObject): string {
  const base = { id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: 0, model: body['model'] };
  const search = mockSearch(body);
  const frames: JsonObject[] = search
    ? [{ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, ...search }] }, finish_reason: 'tool_calls' }] }]
    : splitInto(mockAnswer(body), STREAM_CHUNKS).map((content, index) => ({
        ...base,
        choices: [{ index: 0, delta: index === 0 ? { role: 'assistant', content } : { content }, finish_reason: index === STREAM_CHUNKS - 1 ? 'stop' : null }],
      }));
  frames.push({ ...base, choices: [], usage: MOCK_USAGE });
  return [...frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`), 'data: [DONE]\n\n'].join('');
}

function mockVector(text: string, dimensions: number): number[] {
  const raw = Array.from({ length: dimensions }, (_, index) => {
    let hash = 2166136261;
    for (const char of `${index}:${text}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return ((hash >>> 0) / 0xffffffff) * 2 - 1;
  });
  const norm = Math.hypot(...raw) || 1;
  return raw.map(value => value / norm);
}

function mockEmbeddings(body: JsonObject, dimensions: number): JsonObject {
  const inputs = Array.isArray(body['input']) ? body['input'] : [body['input']];
  const data = inputs.map((input, index) => ({ object: 'embedding', index, embedding: mockVector(String(input), dimensions) }));
  return { object: 'list', model: body['model'], data, usage: MOCK_EMBEDDING_USAGE };
}

function mockImages(body: JsonObject): JsonObject {
  const n = typeof body['n'] === 'number' && body['n'] > 0 ? body['n'] : 1;
  return { data: Array.from({ length: n }, () => ({ b64_json: TRANSPARENT_PIXEL_PNG, media_type: 'image/png' })) };
}

function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (ms === 0) return signal?.aborted ? Promise.reject(signal.reason) : Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function json(payload: JsonObject): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** A `fetch` that answers the mock provider's endpoints without leaving the process, honouring the request's abort signal like a real one */
export function createMockFetch(target: ProviderTarget): ProviderFetch {
  const dimensions = target.model.capabilities.embedding?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  return async (url, init) => {
    await wait(mockDelayMs(target.deploymentId), init.signal);
    const body = asRecord(parseJson(typeof init.body === 'string' ? init.body : '')) ?? {};
    if (url.endsWith('/embeddings')) return json(mockEmbeddings(body, dimensions));
    if (url.endsWith('/images')) return json(mockImages(body));
    if (body['stream'] !== true) return json(mockCompletion(body));
    return new Response(mockStream(body), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}
