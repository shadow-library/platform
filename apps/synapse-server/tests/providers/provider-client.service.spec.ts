import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { ProviderCallError } from '@modules/providers/provider-call.error';
import { ProviderClient } from '@modules/providers/provider-client.service';
import { type ProviderSpec } from '@modules/catalog/catalog.types';
import { type ProviderFetch, type TranslatedRequest } from '@modules/providers/provider.types';

import { collect, GATEWAY, MOCK, OPENROUTER, openStreamOf, sse, streamOf, targetFor } from './provider-fixtures';

interface FetchCall {
  url: string;
  init: RequestInit;
}

const PROMPT = 'a secret manuscript line';
const TRANSLATED: TranslatedRequest = {
  url: 'https://openrouter.test/api/v1/chat/completions',
  headers: { 'content-type': 'application/json', authorization: 'Bearer sk' },
  body: { model: 'vendor/model', messages: [{ role: 'user', content: PROMPT }] },
};
const STREAMED: TranslatedRequest = { ...TRANSLATED, body: { ...TRANSLATED.body, stream: true } };
const COMPLETION = {
  id: 'gen-1',
  model: 'vendor/model',
  provider: 'Anthropic',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.002 },
};

function chunk(content: string, finish: string | null = null): object {
  return { id: 'gen-1', model: 'vendor/model', choices: [{ index: 0, delta: { content }, finish_reason: finish }] };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function recordingFetch(respond: (call: FetchCall) => Response | Promise<Response>): { fetch: ProviderFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch: ProviderFetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { fetch, calls };
}

/** A fetch that never answers on its own and rejects the way fetch does when its signal aborts */
const hangingFetch: ProviderFetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = init.signal as AbortSignal;
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

async function failureOf(promise: Promise<unknown>): Promise<ProviderCallError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderCallError) return error;
    throw error;
  }
  throw new ProviderCallError({ retryable: false, message: 'expected the call to fail' });
}

const openrouter = targetFor('openrouter', OPENROUTER);

describe('ProviderClient', () => {
  let restore: RestoreConfig;

  beforeEach(() => (restore = setConfig({ 'synapse.request.timeout-ms': 1000 })));
  afterEach(() => restore());

  describe('sendChat without streaming', () => {
    it('should post the translated body and return the response with usage parsed out', async () => {
      const { fetch, calls } = recordingFetch(() => json(COMPLETION));

      const result = await new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false, responseModel: 'novel-forge.chat' });

      expect(calls[0]?.url).toBe(TRANSLATED.url);
      expect(calls[0]?.init).toMatchObject({ method: 'POST', headers: TRANSLATED.headers, body: JSON.stringify(TRANSLATED.body) });
      expect(result.usage).toEqual({ inputTokens: 12, cachedInputTokens: 0, outputTokens: 3, reasoningTokens: 0, upstreamCostUsd: 0.002 });
      expect(result.response).toMatchObject({ id: 'gen-1', model: 'novel-forge.chat', choices: COMPLETION.choices });
      expect(result.response).not.toContainAnyKeys(['usage', 'provider', 'gateway']);
    });

    it('should report the model the gateway served', async () => {
      const { fetch } = recordingFetch(() => json({ ...COMPLETION, gateway: { served_by: 'claude', served_model: 'claude-sonnet-5', openrouter: false } }));

      const result = await new ProviderClient(fetch).sendChat(targetFor('subscription', GATEWAY), TRANSLATED, { stream: false });

      expect(result.servedModel).toBe('claude-sonnet-5');
      expect(result.response).not.toHaveProperty('gateway');
      expect(result.usage).not.toHaveProperty('upstreamCostUsd');
    });

    it('should refuse an openai provider without a flavor before calling it', async () => {
      const { flavor: _flavor, ...unflavored } = OPENROUTER;
      const { fetch, calls } = recordingFetch(() => json(COMPLETION));

      expect(await failureOf(new ProviderClient(fetch).sendChat(targetFor('openrouter', unflavored), TRANSLATED, { stream: false }))).toMatchObject({ code: 'unsupported' });
      expect(calls).toHaveLength(0);
    });

    it('should classify a connect failure as retryable', async () => {
      const refused = Object.assign(new Error('Unable to connect. Is the computer able to access the url?'), { code: 'ConnectionRefused' });
      const fetch: ProviderFetch = () => Promise.reject(refused);

      const error = await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }));

      expect(error).toMatchObject({ retryable: true, code: 'connect', bytesSent: false });
      expect(error.message).toContain('Unable to connect');
    });

    it('should treat a request fetch cannot build as fatal, never quoting the TypeError that may hold the key, in the error or the log', async () => {
      const fetch: ProviderFetch = () => Promise.reject(new TypeError("Header 'authorization' has invalid value: 'Bearer sk-or-SECRET'"));
      const client = new ProviderClient(fetch);
      const warn = spyOn(client['logger'], 'warn');

      const error = await failureOf(client.sendChat(openrouter, TRANSLATED, { stream: false }));

      expect(error).toMatchObject({ retryable: false, code: 'invalid_request' });
      expect(error.message).not.toContain('SECRET');
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
    });

    it("should classify an HTTP failure with the upstream's message and never the request body", async () => {
      const { fetch } = recordingFetch(() => json({ error: { message: 'Rate limit exceeded', code: 429 } }, 429));

      const error = await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }));

      expect(error).toMatchObject({ retryable: true, status: 429, message: 'Rate limit exceeded' });
      expect(error.message).not.toContain(PROMPT);
    });

    it('should classify a 200 that carries an upstream error', async () => {
      const { fetch } = recordingFetch(() => json({ error: { message: 'Provider returned error', code: 502 } }));

      expect(await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }))).toMatchObject({ retryable: true, status: 502 });
    });

    it('should fail a 200 that carries an error beside empty choices, never answering an empty success', async () => {
      const { fetch } = recordingFetch(() => json({ choices: [], error: { message: 'Provider returned error', code: 502 } }));

      expect(await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }))).toMatchObject({
        retryable: true,
        status: 502,
        message: 'Provider returned error',
      });
    });

    it('should refuse a 200 without choices as fatal', async () => {
      const { fetch } = recordingFetch(() => json({ id: 'gen-1', object: 'chat.completion' }));

      expect(await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }))).toMatchObject({ retryable: false, code: 'invalid_response' });
    });

    it('should refuse a body that is not JSON as fatal', async () => {
      const { fetch } = recordingFetch(() => new Response('<html>ok</html>', { status: 200 }));

      expect(await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false }))).toMatchObject({ retryable: false, code: 'invalid_response' });
    });
  });

  describe('abort and timeout', () => {
    it('should abort the upstream request when the caller signal aborts', async () => {
      const controller = new AbortController();
      const client = new ProviderClient(hangingFetch);
      const pending = failureOf(client.sendChat(openrouter, TRANSLATED, { stream: false, signal: controller.signal }));

      controller.abort();

      expect(await pending).toMatchObject({ retryable: false, code: 'aborted' });
      expect(client.inflightCount('openrouter')).toBe(0);
    });

    it('should count a call as cancelled when the caller aborts after the response arrived', async () => {
      const controller = new AbortController();
      const fetch: ProviderFetch = async () => {
        controller.abort();
        return json(COMPLETION);
      };

      expect(await failureOf(new ProviderClient(fetch).sendChat(openrouter, TRANSLATED, { stream: false, signal: controller.signal }))).toMatchObject({ code: 'aborted' });
    });

    it('should log a client abort at debug and a timeout at warn, on both paths', async () => {
      const controller = new AbortController();
      const client = new ProviderClient(hangingFetch);
      const debug = spyOn(client['logger'], 'debug');
      const warn = spyOn(client['logger'], 'warn');
      const target = targetFor('subscription', GATEWAY);

      const pending = failureOf(client.sendChat(target, TRANSLATED, { stream: false, signal: controller.signal }));
      controller.abort();
      await pending;
      const streamController = new AbortController();
      const { settled } = await new ProviderClient(() => Promise.resolve(new Response(openStreamOf().stream))).sendChat(target, STREAMED, {
        stream: true,
        signal: streamController.signal,
      });
      streamController.abort();
      await settled;

      expect(debug.mock.calls.map(([message]) => message)).toEqual(['Provider call cancelled']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('should abort the upstream request once the request timeout passes', async () => {
      restore();
      restore = setConfig({ 'synapse.request.timeout-ms': 1 });
      const client = new ProviderClient(hangingFetch);
      const warn = spyOn(client['logger'], 'warn');

      expect(await failureOf(client.sendChat(openrouter, TRANSLATED, { stream: false }))).toMatchObject({ retryable: false, code: 'timeout' });
      expect(warn.mock.calls.map(([message]) => message)).toEqual(['Provider call timed out']);
    });
  });

  describe('in-flight cap', () => {
    const capped: ProviderSpec = { ...GATEWAY, maxInflightPerReplica: 1 };
    const target = targetFor('subscription', capped);

    it('should refuse a call over the cap as retryable and admit one again after release', async () => {
      let answer: (response: Response) => void = () => undefined;
      let calls = 0;
      const fetch: ProviderFetch = () => (++calls === 1 ? new Promise(resolve => (answer = resolve)) : Promise.resolve(json(COMPLETION)));
      const client = new ProviderClient(fetch);

      const first = client.sendChat(target, TRANSLATED, { stream: false });
      const refused = await failureOf(client.sendChat(target, TRANSLATED, { stream: false }));
      expect(client.inflightCount('subscription')).toBe(1);
      answer(json(COMPLETION));
      await first;

      expect(refused).toMatchObject({ retryable: true, code: 'capacity', bytesSent: false });
      expect(client.inflightCount('subscription')).toBe(0);
      expect(await client.sendChat(target, TRANSLATED, { stream: false })).toHaveProperty('response');
    });

    it('should release the slot when the call fails', async () => {
      const client = new ProviderClient(() => Promise.resolve(json({ error: { message: 'boom' } }, 500)));

      await failureOf(client.sendChat(target, TRANSLATED, { stream: false }));

      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should not count providers without a cap against one another', async () => {
      const client = new ProviderClient(() => Promise.resolve(json(COMPLETION)));

      await Promise.all([client.sendChat(openrouter, TRANSLATED, { stream: false }), client.sendChat(openrouter, TRANSLATED, { stream: false })]);

      expect(client.inflightCount('openrouter')).toBe(0);
    });
  });

  describe('sendChat streaming', () => {
    const target = targetFor('subscription', { ...GATEWAY, maxInflightPerReplica: 1 });
    const frames = sse(
      chunk('Hel'),
      chunk('lo', 'stop'),
      { choices: [], usage: { prompt_tokens: 9, completion_tokens: 2 }, gateway: { served_model: 'claude-sonnet-5' } },
      '[DONE]',
    );

    it('should yield relabelled chunks and settle with the final usage, holding the slot until the end', async () => {
      const client = new ProviderClient(() => Promise.resolve(new Response(streamOf(frames))));

      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true, responseModel: 'novel-forge.chat' });
      expect(client.inflightCount('subscription')).toBe(1);
      const received = await collect(chunks);

      expect(received.map(item => item['model'])).toEqual(['novel-forge.chat', 'novel-forge.chat']);
      expect(await settled).toEqual({
        status: 'ok',
        chunks: 2,
        usage: { inputTokens: 9, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: 0 },
        servedModel: 'claude-sonnet-5',
      });
      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should settle cancelled, release the slot and drop the upstream when the consumer stops early', async () => {
      const { stream, cancelled } = openStreamOf(sse(chunk('a'), chunk('b')));
      const client = new ProviderClient(() => Promise.resolve(new Response(stream)));

      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true });
      for await (const _item of chunks) break;

      expect(await settled).toMatchObject({ status: 'cancelled', chunks: 1, error: { code: 'aborted', bytesSent: true } });
      expect(client.inflightCount('subscription')).toBe(0);
      expect(cancelled()).toBe(true);
    });

    it('should release the slot of a stream returned before it was ever read', async () => {
      const { stream } = openStreamOf();
      const client = new ProviderClient(() => Promise.resolve(new Response(stream)));

      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true });
      await chunks.return?.();

      expect(await settled).toMatchObject({ status: 'cancelled', chunks: 0 });
      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should settle cancelled and release the slot when the caller aborts an unread stream', async () => {
      const controller = new AbortController();
      const { stream, cancelled } = openStreamOf(sse(chunk('a')));
      const client = new ProviderClient(() => Promise.resolve(new Response(stream)));

      const { settled } = await client.sendChat(target, STREAMED, { stream: true, signal: controller.signal });
      controller.abort();

      expect(await settled).toMatchObject({ status: 'cancelled', error: { code: 'aborted' } });
      expect(client.inflightCount('subscription')).toBe(0);
      expect(cancelled()).toBe(true);
    });

    it('should fail the consumer and settle cancelled when the caller aborts mid-read', async () => {
      const controller = new AbortController();
      const { stream } = openStreamOf(sse(chunk('a')));
      const client = new ProviderClient(() => Promise.resolve(new Response(stream)));
      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true, signal: controller.signal });

      const failure = failureOf(
        (async () => {
          for await (const _item of chunks) controller.abort();
        })(),
      );

      expect(await failure).toMatchObject({ code: 'aborted', bytesSent: true });
      expect(await settled).toMatchObject({ status: 'cancelled' });
      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should release the slot and settle when an abort lands before the stream is read', async () => {
      const controller = new AbortController();
      const client = new ProviderClient(async () => {
        controller.abort();
        return new Response(openStreamOf(sse(chunk('a'))).stream);
      });

      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true, signal: controller.signal });
      await chunks.return?.();

      expect(await settled).toMatchObject({ status: 'cancelled', error: { code: 'aborted' } });
      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should time out a stream that stalls', async () => {
      restore();
      restore = setConfig({ 'synapse.request.timeout-ms': 2 });
      const { stream } = openStreamOf(sse(chunk('a')));
      const client = new ProviderClient(() => Promise.resolve(new Response(stream)));
      const warn = spyOn(client['logger'], 'warn');
      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true });

      expect(await failureOf(collect(chunks))).toMatchObject({ code: 'timeout', bytesSent: true });
      expect(await settled).toMatchObject({ status: 'cancelled', error: { code: 'timeout' } });
      expect(warn.mock.calls.map(([message]) => message)).toEqual(['Provider call timed out']);
    });

    it('should fail the consumer and settle as an error on an upstream error frame', async () => {
      const client = new ProviderClient(() => Promise.resolve(new Response(streamOf(sse(chunk('a'), { error: { message: 'CLI crashed', type: 'server_error' } })))));
      const { chunks, settled } = await client.sendChat(target, STREAMED, { stream: true });

      expect(await failureOf(collect(chunks))).toMatchObject({ message: 'CLI crashed', retryable: false, bytesSent: true });
      expect(await settled).toMatchObject({ status: 'error', chunks: 1, error: { message: 'CLI crashed' } });
      expect(client.inflightCount('subscription')).toBe(0);
    });

    it('should throw before returning a stream when the upstream refuses it, releasing the slot', async () => {
      const client = new ProviderClient(() => Promise.resolve(json({ error: { message: 'busy' } }, 503)));

      expect(await failureOf(client.sendChat(target, STREAMED, { stream: true }))).toMatchObject({ retryable: true, status: 503 });
      expect(client.inflightCount('subscription')).toBe(0);
    });
  });

  describe('sendEmbeddings', () => {
    it('should return the embeddings with their usage', async () => {
      const { fetch } = recordingFetch(() =>
        json({ object: 'list', model: 'vendor/embed', data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 4, total_tokens: 4 } }),
      );

      const result = await new ProviderClient(fetch).sendEmbeddings(openrouter, TRANSLATED, { responseModel: 'memoir.embed' });

      expect(result.response).toEqual({ object: 'list', model: 'memoir.embed', data: [{ index: 0, embedding: [0.1, 0.2] }] });
      expect(result.usage).toMatchObject({ inputTokens: 4, outputTokens: 0 });
    });
  });

  describe('sendImages', () => {
    it('should return the image data with the upstream cost, defaulting the media type', async () => {
      const { fetch } = recordingFetch(() => json({ data: [{ b64_json: 'AAA', media_type: 'image/webp' }, { b64_json: 'BBB' }, { url: 'ignored' }], usage: { cost: 0.04 } }));

      expect(await new ProviderClient(fetch).sendImages(openrouter, TRANSLATED)).toEqual({
        data: [
          { b64_json: 'AAA', media_type: 'image/webp' },
          { b64_json: 'BBB', media_type: 'image/png' },
        ],
        upstreamCostUsd: 0.04,
      });
    });

    it('should fail fatally when the provider returns no image data', async () => {
      const { fetch } = recordingFetch(() => json({ data: [] }));

      expect(await failureOf(new ProviderClient(fetch).sendImages(openrouter, TRANSLATED))).toMatchObject({ retryable: false, code: 'invalid_response' });
    });
  });

  describe('mock provider', () => {
    const unreachable: ProviderFetch = () => Promise.reject(new TypeError('the mock must not reach the network'));
    const mockRequest: TranslatedRequest = { url: 'mock://local/chat/completions', headers: {}, body: { model: 'echo', messages: [] } };

    it('should answer without the network', async () => {
      const result = await new ProviderClient(unreachable).sendChat(targetFor('mock', MOCK, 'echo'), mockRequest, { stream: false });

      expect(result.response).toMatchObject({ choices: [{ message: { content: '{"ok":true}' } }] });
      expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
    });

    it('should stream three chunks and settle with the canned usage', async () => {
      const { chunks, settled } = await new ProviderClient(unreachable).sendChat(
        targetFor('mock', MOCK, 'echo'),
        { ...mockRequest, body: { ...mockRequest.body, stream: true } },
        { stream: true },
      );

      expect(await collect(chunks)).toHaveLength(3);
      expect(await settled).toMatchObject({ status: 'ok', usage: { inputTokens: 10, outputTokens: 5 } });
    });

    it('should hold its in-flight slot through its delay', async () => {
      const client = new ProviderClient(unreachable);
      const target = targetFor('mock', { ...MOCK, maxInflightPerReplica: 1 }, 'echo?delay-ms=2');

      const first = client.sendChat(target, mockRequest, { stream: false });
      const refused = await failureOf(client.sendChat(target, mockRequest, { stream: false }));
      await first;

      expect(refused.code).toBe('capacity');
      expect(client.inflightCount('mock')).toBe(0);
    });
  });
});
