import { describe, expect, it } from 'bun:test';

import { type ChatTranslationInput, translateChatRequest, translateEmbeddingRequest, translateImageRequest } from '@modules/providers/chat-translation.util';
import { type ModelCapabilities } from '@modules/catalog/catalog.types';
import { WEB_SEARCH_TOOL } from '@modules/providers/hosted-search.util';
import { type ChatRequestBody } from '@modules/providers/provider.types';

import { chatBody, ENVELOPE, GATEWAY, MOCK, modelSpec, OLLAMA, OPENAI_COMPATIBLE, OPENROUTER } from './provider-fixtures';

function translate(overrides: Partial<ChatTranslationInput> & { capabilities?: Partial<ModelCapabilities> } = {}): ReturnType<typeof translateChatRequest> {
  const { capabilities, ...rest } = overrides;
  return translateChatRequest({
    body: chatBody(),
    model: modelSpec(capabilities),
    provider: OPENROUTER,
    providerKey: 'openrouter',
    deploymentId: 'anthropic/claude-opus-5.5',
    effort: null,
    envelope: ENVELOPE,
    apiKey: API_KEY,
    ...rest,
  });
}

const API_KEY = 'sk-or-secret';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };
const JSON_SCHEMA_FORMAT: ChatRequestBody['response_format'] = { type: 'json_schema', json_schema: { name: 'answer', schema: SCHEMA } };
const ONE_OPTIONAL = { ...SCHEMA, properties: { ...SCHEMA.properties, subtitle: { type: 'string' } } };
const ONE_OPTIONAL_FORMAT: ChatRequestBody['response_format'] = { type: 'json_schema', json_schema: { name: 'answer', schema: ONE_OPTIONAL } };

describe('translateChatRequest', () => {
  describe('model id and envelope', () => {
    it('should send the deployment id as the model and drop the synapse envelope', () => {
      const { body } = translate();

      expect(body['model']).toBe('anthropic/claude-opus-5.5');
      expect(body).not.toHaveProperty('synapse');
    });

    it("should drop an app's own provider dialect fields", () => {
      const { body } = translate({ body: { ...chatBody(), reasoning: { effort: 'max' }, plugins: [{ id: 'web' }], format: 'json', reasoning_effort: 'high' } as ChatRequestBody });

      expect(body).not.toContainAnyKeys(['reasoning', 'plugins', 'format', 'reasoning_effort']);
    });

    it('should leave the caller body untouched', () => {
      const body = chatBody({ temperature: 0.4, messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi', cache_control: { type: 'ephemeral' } }] }] });
      const snapshot = structuredClone(body);

      translate({ body, capabilities: { sampling: false } });

      expect(body).toEqual(snapshot);
    });
  });

  describe('provider flavor', () => {
    it('should refuse an openai provider that names no flavor as fatal', () => {
      const { flavor: _flavor, ...unflavored } = OPENROUTER;

      expect(() => translate({ provider: unflavored })).toThrow(expect.objectContaining({ retryable: false, code: 'unsupported' }));
    });

    it("should send a plain openai-compatible provider none of the other flavors' quirks", () => {
      const translated = translate({ provider: OPENAI_COMPATIBLE, effort: 'high', envelope: { ...ENVELOPE, session: 's-1', web_search: true } });

      expect(translated.url).toBe('https://llm.test/v1/chat/completions');
      expect(translated.body).not.toContainAnyKeys(['reasoning', 'plugins']);
      expect(translated.headers).not.toContainAnyKeys(['x-gateway-session', 'x-gateway-web-tools']);
      expect(translated.webSearch).toBe(false);
    });

    it('should not send the gateway headers to a gateway that lacks the matching features', () => {
      const bare = { ...GATEWAY, features: [] };

      const translated = translate({ provider: bare, envelope: { ...ENVELOPE, session: 's-1', web_search: true } });

      expect(translated.headers).not.toContainAnyKeys(['x-gateway-session', 'x-gateway-web-tools']);
      expect(translated.webSearch).toBe(false);
    });
  });

  describe('endpoint and auth', () => {
    it('should post an openai provider to its chat completions endpoint with the resolved key', () => {
      const { url, headers } = translate();

      expect(url).toBe('https://openrouter.test/api/v1/chat/completions');
      expect(headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer sk-or-secret' });
    });

    it('should send no authorization when no key was resolved', () => {
      expect(translate({ provider: GATEWAY, providerKey: 'subscription', apiKey: undefined }).headers).toEqual({ 'content-type': 'application/json' });
    });

    it("should use Ollama's OpenAI-compatible endpoint without auth", () => {
      const { url, headers } = translate({ provider: OLLAMA, providerKey: 'local' });

      expect(url).toBe('http://ollama.test:11434/v1/chat/completions');
      expect(headers).not.toHaveProperty('authorization');
    });

    it('should refuse a key a header cannot carry without ever quoting it', () => {
      for (const apiKey of ['sk-or-SECRET\r\nX-Injected: 1', 'sk-or-SECRET\u0000', 'sk-or SECRET', 'sk-or-SECRET-✓']) {
        let caught: unknown;
        try {
          translate({ apiKey });
        } catch (error) {
          caught = error;
        }
        expect(caught).toMatchObject({ retryable: false, code: 'invalid_api_key' });
        expect((caught as Error).message).toContain("'openrouter'");
        expect((caught as Error).message).not.toContain('SECRET');
      }
    });
  });

  describe('effort', () => {
    it('should send the effort as a reasoning object to an openai provider', () => {
      expect(translate({ effort: 'high' }).body['reasoning']).toEqual({ effort: 'high' });
      expect(translate({ effort: 'low', provider: GATEWAY }).body['reasoning']).toEqual({ effort: 'low' });
    });

    it('should never send reasoning control to Ollama', () => {
      expect(translate({ effort: 'high', provider: OLLAMA }).body).not.toHaveProperty('reasoning');
    });

    it('should send effort none only to OpenRouter for a model whose reasoning is optional', () => {
      expect(translate({ effort: 'none' }).body['reasoning']).toEqual({ effort: 'none' });
      expect(translate({ effort: 'none', capabilities: { reasoning: 'mandatory' } }).body).not.toHaveProperty('reasoning');
      expect(translate({ effort: 'none', provider: GATEWAY }).body).not.toHaveProperty('reasoning');
    });

    it('should send no reasoning control without an effort or to a model that does not reason', () => {
      expect(translate({ effort: null }).body).not.toHaveProperty('reasoning');
      expect(translate({ effort: 'high', capabilities: { reasoning: 'none' } }).body).not.toHaveProperty('reasoning');
    });
  });

  describe('gateway switches', () => {
    it('should forward the session as a gateway header only to a provider that keeps sessions', () => {
      const envelope = { ...ENVELOPE, session: 'dev:p-1:s-1' };

      expect(translate({ provider: GATEWAY, envelope }).headers['x-gateway-session']).toBe('dev:p-1:s-1');
      expect(translate({ envelope }).headers).not.toHaveProperty('x-gateway-session');
    });

    it('should refuse a session a header cannot carry', () => {
      for (const session of ['dev:p-1\r\nX-Injected: 1', 'dev p-1', 'dev:✓', 'x'.repeat(257)]) {
        expect(() => translate({ provider: GATEWAY, envelope: { ...ENVELOPE, session } })).toThrow(expect.objectContaining({ retryable: false, code: 'invalid_session' }));
      }
    });

    it("should ask the gateway for its CLI's web tools when web search is requested", () => {
      const translated = translate({ provider: GATEWAY, envelope: { ...ENVELOPE, web_search: true } });

      expect(translated.headers['x-gateway-web-tools']).toBe('on');
      expect(translated.body).not.toHaveProperty('plugins');
      expect(translated.webSearch).toBe(true);
    });

    it('should report no web search on the gateway when the request brings its own tools, which the gateway refuses web tools for', () => {
      const translated = translate({ provider: GATEWAY, body: chatBody({ tools: [{ type: 'function' }] }), envelope: { ...ENVELOPE, web_search: true } });

      expect(translated.headers).not.toHaveProperty('x-gateway-web-tools');
      expect(translated.webSearch).toBe(false);
    });
  });

  describe('gateway tool controls', () => {
    const tools = [{ type: 'function', function: { name: 'lookup' } }];
    const withControls = (controls: Record<string, unknown>): ChatRequestBody => ({ ...chatBody({ tools }), ...controls }) as ChatRequestBody;

    it('should drop parallel_tool_calls=false for the gateway only', () => {
      const body = withControls({ parallel_tool_calls: false });

      expect(translate({ provider: GATEWAY, body }).body).not.toHaveProperty('parallel_tool_calls');
      expect(translate({ provider: OPENROUTER, body }).body['parallel_tool_calls']).toBe(false);
    });

    it('should keep parallel_tool_calls=true and tool_choice auto for the gateway', () => {
      const { body } = translate({ provider: GATEWAY, body: withControls({ parallel_tool_calls: true, tool_choice: 'auto' }) });

      expect(body['parallel_tool_calls']).toBe(true);
      expect(body['tool_choice']).toBe('auto');
    });

    it('should turn tool_choice none beside tools into a request without tools for the gateway', () => {
      const { body } = translate({ provider: GATEWAY, body: withControls({ tool_choice: 'none', parallel_tool_calls: false }) });

      expect(body).not.toContainAnyKeys(['tools', 'tool_choice', 'parallel_tool_calls']);
    });

    it('should leave tool_choice required to the gateway to refuse so the call fails over', () => {
      expect(translate({ provider: GATEWAY, body: withControls({ tool_choice: 'required' }) }).body['tool_choice']).toBe('required');
    });
  });

  describe('hosted web search', () => {
    it("should offer Synapse's own search tool, never the web plugin, where the catalog configures one", () => {
      const translated = translate({ envelope: { ...ENVELOPE, web_search: true }, hostedSearch: true });

      expect(translated.body['tools']).toEqual([WEB_SEARCH_TOOL]);
      expect(translated.body['tool_choice']).toBe('auto');
      expect(translated.body).not.toHaveProperty('plugins');
      expect(translated).toMatchObject({ webSearch: true, hostedSearch: true });
    });

    it('should report web search unapplied where nothing can run it: no tool configured, a model without tools, or a request with tools of its own', () => {
      const unconfigured = translate({ envelope: { ...ENVELOPE, web_search: true } });
      const toolless = translate({ envelope: { ...ENVELOPE, web_search: true }, hostedSearch: true, capabilities: { tools: false } });
      const ownTools = translate({ body: chatBody({ tools: [{ type: 'function' }] }), envelope: { ...ENVELOPE, web_search: true }, hostedSearch: true });

      for (const translated of [unconfigured, toolless, ownTools]) {
        expect(translated.body).not.toContainAnyKeys(['plugins', 'tool_choice']);
        expect(translated.webSearch).toBe(false);
        expect(translated).not.toHaveProperty('hostedSearch');
      }
    });

    it('should leave a gateway with its own search to its CLI rather than host one', () => {
      const translated = translate({ provider: GATEWAY, envelope: { ...ENVELOPE, web_search: true }, hostedSearch: true });

      expect(translated.headers['x-gateway-web-tools']).toBe('on');
      expect(translated).not.toHaveProperty('hostedSearch');
    });

    it('should report nothing about web search when it was not requested', () => {
      const translated = translate({ hostedSearch: true });

      expect(translated.body).not.toContainAnyKeys(['plugins', 'tools']);
      expect(translated).not.toHaveProperty('webSearch');
    });
  });

  describe('response_format', () => {
    it('should pass a json_schema response format through to a model with native structured output', () => {
      const { body } = translate({ body: chatBody({ response_format: JSON_SCHEMA_FORMAT }) });

      expect(body['response_format']).toEqual(JSON_SCHEMA_FORMAT);
      expect(body['messages']).toHaveLength(1);
    });

    it('should move the schema into a final system message for a model with prompted structured output', () => {
      const { body } = translate({ body: chatBody({ response_format: JSON_SCHEMA_FORMAT }), capabilities: { structuredOutput: 'prompt' } });

      expect(body).not.toHaveProperty('response_format');
      expect(body).not.toHaveProperty('format');
      expect((body['messages'] as unknown[]).at(-1)).toEqual({
        role: 'system',
        content: `Respond with only a JSON object that matches this JSON Schema: ${JSON.stringify(SCHEMA)}`,
      });
    });

    it("should prompt a schema with more optional properties than the model's native structured output takes", () => {
      const { body } = translate({ body: chatBody({ response_format: ONE_OPTIONAL_FORMAT }), capabilities: { structuredOutput: 'native', maxOptionalProperties: 0 } });

      expect(body).not.toHaveProperty('response_format');
      expect((body['messages'] as { content: string }[]).at(-1)?.content).toContain(JSON.stringify(ONE_OPTIONAL));
    });

    it('should keep a schema within the limit native', () => {
      const { body } = translate({ body: chatBody({ response_format: ONE_OPTIONAL_FORMAT }), capabilities: { structuredOutput: 'native', maxOptionalProperties: 1 } });

      expect(body['response_format']).toEqual(ONE_OPTIONAL_FORMAT);
    });

    it("should also switch on Ollama's JSON mode through its OpenAI-compatible response format, keeping the schema in the prompt", () => {
      const { body } = translate({ provider: OLLAMA, body: chatBody({ response_format: JSON_SCHEMA_FORMAT }), capabilities: { structuredOutput: 'prompt' } });

      expect(body['response_format']).toEqual({ type: 'json_object' });
      expect(body).not.toHaveProperty('format');
      expect((body['messages'] as { content: string }[]).at(-1)?.content).toContain(JSON.stringify(SCHEMA));
    });

    it('should send a gateway deployment the schema in the prompt and no response_format even for a native model', () => {
      const { body } = translate({ provider: GATEWAY, body: chatBody({ response_format: JSON_SCHEMA_FORMAT }), capabilities: { structuredOutput: 'native' } });

      expect(body).not.toHaveProperty('response_format');
      expect((body['messages'] as { content: string }[]).at(-1)?.content).toContain(JSON.stringify(SCHEMA));
    });

    it('should still send the same native model its response_format on OpenRouter after a failover', () => {
      const request = { body: chatBody({ response_format: JSON_SCHEMA_FORMAT }), capabilities: { structuredOutput: 'native' } } as const;

      expect(translate({ ...request, provider: GATEWAY }).body).not.toHaveProperty('response_format');
      expect(translate({ ...request, provider: OPENROUTER }).body['response_format']).toEqual(JSON_SCHEMA_FORMAT);
    });

    it('should replace a json_object response format with an instruction for the gateway', () => {
      const { body } = translate({ provider: GATEWAY, body: chatBody({ response_format: { type: 'json_object' } }) });

      expect(body).not.toHaveProperty('response_format');
      expect((body['messages'] as { content: string }[]).at(-1)?.content).toBe('Respond with only a valid JSON object.');
    });

    it('should leave a json_object response format alone', () => {
      const { body } = translate({ body: chatBody({ response_format: { type: 'json_object' } }), capabilities: { structuredOutput: 'prompt' } });

      expect(body['response_format']).toEqual({ type: 'json_object' });
    });
  });

  describe('cache_control', () => {
    const messages: ChatRequestBody['messages'] = [
      { role: 'system', content: [{ type: 'text', text: 'Stable', cache_control: { type: 'ephemeral' } }], cache_control: { type: 'ephemeral' } },
      { role: 'user', content: 'Hi' },
    ];

    it('should keep cache_control for a model with Anthropic prompt caching', () => {
      expect(translate({ body: chatBody({ messages }), capabilities: { promptCache: 'anthropic' } }).body['messages']).toEqual(messages);
    });

    it('should strip cache_control but keep the parts for any other model', () => {
      expect(translate({ body: chatBody({ messages }) }).body['messages']).toEqual([
        { role: 'system', content: [{ type: 'text', text: 'Stable' }] },
        { role: 'user', content: 'Hi' },
      ]);
    });
  });

  describe('sampling', () => {
    const sampled = { temperature: 0.7, top_p: 0.9, seed: 7, stop: ['END'], frequency_penalty: 0.1, presence_penalty: 0.2 } as Partial<ChatRequestBody>;

    it('should drop sampling fields for a model that rejects them', () => {
      const { body } = translate({ body: chatBody({ ...sampled, max_tokens: 50 }), capabilities: { sampling: false } });

      expect(body).not.toContainAnyKeys(['temperature', 'top_p', 'seed', 'stop', 'frequency_penalty', 'presence_penalty']);
      expect(body['max_tokens']).toBe(50);
    });

    it('should keep sampling fields for a model that accepts them', () => {
      expect(translate({ body: chatBody(sampled) }).body).toMatchObject(sampled);
    });
  });

  describe('streaming', () => {
    it('should ask a stream for its usage frame, keeping the caller stream options', () => {
      const { body } = translate({ body: chatBody({ stream: true, stream_options: { other: 1 } }) });

      expect(body['stream_options']).toEqual({ other: 1, include_usage: true });
    });

    it('should leave stream options off a non-streamed call', () => {
      expect(translate().body).not.toHaveProperty('stream_options');
    });
  });

  it('should translate a mock provider like an openai one', () => {
    const { url, body } = translate({ provider: MOCK, providerKey: 'mock', effort: 'low' });

    expect(url).toBe('mock://local/chat/completions');
    expect(body['reasoning']).toEqual({ effort: 'low' });
  });
});

describe('translateEmbeddingRequest', () => {
  it('should send the deployment id to the provider embeddings endpoint without the envelope', () => {
    const translated = translateEmbeddingRequest({
      body: { model: 'memoir.embed', input: ['a', 'b'], synapse: ENVELOPE },
      provider: OPENROUTER,
      providerKey: 'openrouter',
      deploymentId: 'vendor/embed',
      apiKey: API_KEY,
    });

    expect(translated).toEqual({
      url: 'https://openrouter.test/api/v1/embeddings',
      headers: { 'content-type': 'application/json', authorization: 'Bearer sk-or-secret' },
      body: { model: 'vendor/embed', input: ['a', 'b'] },
    });
  });

  it("should use Ollama's OpenAI-compatible embeddings endpoint", () => {
    const translated = translateEmbeddingRequest({ body: { model: 'memoir.embed', input: 'a' }, provider: OLLAMA, providerKey: 'local', deploymentId: 'qwen3-embedding:0.6b' });

    expect(translated.url).toBe('http://ollama.test:11434/v1/embeddings');
    expect(translated.headers).toEqual({ 'content-type': 'application/json' });
  });
});

describe('translateImageRequest', () => {
  it("should send OpenRouter's images shape with the references as input references", () => {
    const translated = translateImageRequest({
      body: { model: 'novel-forge.image', prompt: 'A lighthouse', n: 2, reference_images: ['data:image/png;base64,AAA', 'https://img.test/a.png'], synapse: ENVELOPE },
      provider: OPENROUTER,
      providerKey: 'openrouter',
      deploymentId: 'vendor/image',
    });

    expect(translated.url).toBe('https://openrouter.test/api/v1/images');
    expect(translated.body).toEqual({
      model: 'vendor/image',
      prompt: 'A lighthouse',
      n: 2,
      input_references: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        { type: 'image_url', image_url: { url: 'https://img.test/a.png' } },
      ],
    });
  });

  it('should default to one image and send no references when none are given', () => {
    const translated = translateImageRequest({
      body: { model: 'novel-forge.image', prompt: 'A lighthouse' },
      provider: OPENROUTER,
      providerKey: 'openrouter',
      deploymentId: 'vendor/image',
    });

    expect(translated.body).toEqual({ model: 'vendor/image', prompt: 'A lighthouse', n: 1 });
  });

  it('should refuse image generation on any provider but OpenRouter as fatal', () => {
    for (const provider of [OLLAMA, GATEWAY, OPENAI_COMPATIBLE]) {
      expect(() => translateImageRequest({ body: { model: 'x', prompt: 'p' }, provider, providerKey: 'p', deploymentId: 'm' })).toThrow(
        expect.objectContaining({ retryable: false, code: 'unsupported' }),
      );
    }
  });
});
