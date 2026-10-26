import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { type WebSearchToolSpec } from '@modules/catalog/catalog.types';
import { type InferenceBody } from '@modules/inference/inference.service';
import { UNTRUSTED_RESULTS_NOTE, WEB_SEARCH_TOOL } from '@modules/providers/hosted-search.util';
import { type ChatRequestBody } from '@modules/providers/provider.types';

import { APP, catalogDocument, chunk, envelope, FakeSink, harness, json, sse } from './inference.fixtures';

const USAGE = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
const MOCK_SEARCH: WebSearchToolSpec = { kind: 'mock', url: 'http://search.mock', maxSearches: 2, results: 2, pricePerSearchUsd: 0.005 };

function completion(message: Record<string, unknown>): Record<string, unknown> {
  return { id: 'chatcmpl-up', object: 'chat.completion', created: 1, model: 'vendor/opus', choices: [{ index: 0, message: { role: 'assistant', ...message } }], usage: USAGE };
}

function searching(id: string, query: string): Record<string, unknown> {
  return completion({ content: null, tool_calls: [{ id, type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query }) } }] });
}

function callChunk(id: string, query: string, finish: string | null): object {
  const arguments_ = JSON.stringify({ query });
  return {
    id: 'chatcmpl-up',
    object: 'chat.completion.chunk',
    created: 1700000000,
    model: 'vendor/opus',
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name: 'web_search', arguments: arguments_ } }] }, finish_reason: finish }],
  };
}

const usageFrame = { id: 'chatcmpl-up', object: 'chat.completion.chunk', created: 1700000000, model: 'vendor/opus', choices: [], usage: USAGE };

function chatBody(overrides: Partial<InferenceBody<ChatRequestBody>> = {}): InferenceBody<ChatRequestBody> {
  return { model: 'novel-forge.chat', messages: [{ role: 'user', content: 'Who keeps the lighthouse?' }], synapse: envelope({ web_search: true }), ...overrides };
}

const withSearch = (spec: WebSearchToolSpec = MOCK_SEARCH) => catalogDocument(document => (document.tools = { webSearch: spec }));

let restoreLogger: RestoreLogger;
let restoreConfig: RestoreConfig;
beforeAll(() => {
  restoreLogger = silenceLogger();
  restoreConfig = setConfig({ 'synapse.request.timeout-ms': 60_000 });
});
afterAll(() => {
  restoreConfig();
  restoreLogger();
});

describe('InferenceService hosted web search', () => {
  it('should run the search the model asks for, answer the call with untrusted results, and ask again', async () => {
    const { service, fetcher, repository, begin } = harness(withSearch());
    fetcher.on('https://flaky.test', json(200, searching('call-1', 'lighthouse keepers')), json(200, completion({ content: 'Tamsin keeps it.' })));

    const response = await service.completeChat(APP, chatBody(), begin());

    expect(fetcher.calls[0]?.body).toMatchObject({ tools: [WEB_SEARCH_TOOL], tool_choice: 'auto' });
    const [, assistant, tool] = fetcher.calls[1]?.body['messages'] as Record<string, unknown>[];
    expect(assistant).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call-1', function: { name: 'web_search' } }] });
    expect(tool).toMatchObject({ role: 'tool', tool_call_id: 'call-1' });
    expect(JSON.parse(String(tool?.['content']))).toMatchObject({ note: UNTRUSTED_RESULTS_NOTE, results: [{ title: 'Result 1 for lighthouse keepers' }, {}] });
    expect(response['choices']).toEqual([{ index: 0, message: { role: 'assistant', content: 'Tamsin keeps it.' } }]);
    expect(response['usage']).toMatchObject({ prompt_tokens: 200, completion_tokens: 40 });
    expect(response['synapse']).toMatchObject({ web_search: true, web_searches: 1 });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', inputTokens: 200, outputTokens: 40 });
    expect(repository.settlements[0]?.listCostUsd).toBeCloseTo(0.002 + 0.005, 6);
  });

  it('should let the last round the limit allows only answer, and strip a search call it makes anyway', async () => {
    const { service, fetcher, begin } = harness(withSearch({ ...MOCK_SEARCH, maxSearches: 1 }));
    fetcher.on('https://flaky.test', json(200, searching('call-1', 'first')), json(200, searching('call-2', 'second')));

    const response = await service.completeChat(APP, chatBody(), begin());

    expect(fetcher.calls[1]?.body['tool_choice']).toBe('none');
    expect(fetcher.calls).toHaveLength(2);
    expect(response['choices']).toEqual([{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'stop' }]);
    expect(response['synapse']).toMatchObject({ web_searches: 1 });
  });

  it('should answer a search that cannot run with its reason, and still answer the call', async () => {
    const brave: WebSearchToolSpec = { kind: 'brave', url: 'https://api.search.brave.com', maxSearches: 2, results: 2 };
    const { service, fetcher, begin } = harness(withSearch(brave));
    fetcher.on('https://flaky.test', json(200, searching('call-1', 'lighthouse')), json(200, completion({ content: 'From memory.' })));

    const response = await service.completeChat(APP, chatBody(), begin());

    const tool = (fetcher.calls[1]?.body['messages'] as Record<string, unknown>[]).at(-1);
    expect(JSON.parse(String(tool?.['content']))).toEqual({ error: 'The search failed: no search key is configured' });
    expect(response['choices']).toMatchObject([{ message: { content: 'From memory.' } }]);
  });

  it('should offer no search tool when web search was not asked for, no tool is configured, or the request brings its own tools', async () => {
    const cases: [ReturnType<typeof catalogDocument>, InferenceBody<ChatRequestBody>][] = [
      [withSearch(), chatBody({ synapse: envelope() })],
      [catalogDocument(), chatBody()],
      [withSearch(), chatBody({ tools: [{ type: 'function', function: { name: 'own' } }] })],
    ];
    for (const [document, body] of cases) {
      const { service, fetcher, begin } = harness(document);
      fetcher.on('https://flaky.test', json(200, completion({ content: 'hi' })));

      const response = await service.completeChat(APP, body, begin());

      expect(JSON.stringify(fetcher.calls[0]?.body['tools'] ?? [])).not.toContain('web_search');
      expect(response['synapse']).not.toHaveProperty('web_searches');
    }
  });

  it('should relay a round as it streams, keep its search call back, and reset what it relayed before searching', async () => {
    const { service, fetcher, begin } = harness(withSearch());
    fetcher.on(
      'https://flaky.test',
      sse(chunk('Let me look.'), callChunk('call-1', 'lighthouse', null), chunk('', 'tool_calls'), usageFrame, '[DONE]'),
      sse(chunk('Tamsin'), chunk(' keeps it.', 'stop'), usageFrame, '[DONE]'),
    );
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    const frames = sink.parsed();
    const contents = frames.map(frame => (frame['choices'] as { delta?: { content?: string } }[] | undefined)?.[0]?.delta?.content ?? '');
    const reset = frames.findIndex(frame => frame['synapse_event'] !== undefined);
    expect(frames[reset]?.['synapse_event']).toEqual({ type: 'reset', reason: 'web_search' });
    expect(contents.slice(0, reset).join('')).toBe('Let me look.');
    expect(contents.slice(reset + 1).join('')).toBe('Tamsin keeps it.');
    expect(sink.frames.some(frame => frame.includes('tool_calls'))).toBe(false);
    expect(frames.at(-1)).toMatchObject({ usage: { prompt_tokens: 200, completion_tokens: 40 }, synapse: { web_search: true, web_searches: 1 } });
    expect(sink.frames.at(-1)).toBe('[DONE]');
  });

  it('should search once through a mock deployment and answer, streamed or not', async () => {
    const mockOnly = catalogDocument(document => {
      document.tools = { webSearch: MOCK_SEARCH };
      document.models['opus']!.deployments = [{ provider: 'mock', id: 'echo' }];
    });
    const { service, begin } = harness(mockOnly);
    const sink = new FakeSink();

    const answered = await service.completeChat(APP, chatBody(), begin());
    await service.streamChat(APP, chatBody({ stream: true, synapse: envelope({ web_search: true, request_id: 'req-2' }) }), begin(), sink);

    expect(answered['choices']).toMatchObject([{ message: { content: '{"ok":true}' } }]);
    expect(answered['synapse']).toMatchObject({ provider: 'mock', web_searches: 1 });
    expect(sink.parsed().at(-1)).toMatchObject({ synapse: { provider: 'mock', web_searches: 1 } });
  });

  it('should count a round once when the search limit ends the stream on it', async () => {
    const { service, fetcher, repository, begin } = harness(withSearch({ ...MOCK_SEARCH, maxSearches: 1 }));
    fetcher.on('https://flaky.test', sse(callChunk('call-1', 'first', 'tool_calls'), usageFrame, '[DONE]'), sse(callChunk('call-2', 'second', 'tool_calls'), usageFrame, '[DONE]'));

    await service.streamChat(APP, chatBody({ stream: true }), begin(), new FakeSink());

    expect(fetcher.calls[1]?.body['tool_choice']).toBe('none');
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', inputTokens: 200, outputTokens: 40 });
  });

  it('should send no reset when a searching round relayed no text', async () => {
    const { service, fetcher, begin } = harness(withSearch());
    fetcher.on('https://flaky.test', sse(callChunk('call-1', 'lighthouse', 'tool_calls'), usageFrame, '[DONE]'), sse(chunk('Answer', 'stop'), usageFrame, '[DONE]'));
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    expect(sink.parsed().some(frame => frame['synapse_event'] !== undefined)).toBe(false);
    expect(sink.parsed().at(-1)).toMatchObject({ synapse: { web_searches: 1 } });
  });
});
