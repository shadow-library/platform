import { describe, expect, it } from 'bun:test';

import { ProviderCallError } from '@modules/providers/provider-call.error';
import { type ChatStreamState, readChatChunks, readSseData } from '@modules/providers/sse.util';

import { collect, openStreamOf, sse, streamOf } from './provider-fixtures';

function freshState(): ChatStreamState {
  return { done: false, finished: false, chunks: 0 };
}

function chunk(content: string, finish: string | null = null): object {
  return { id: 'c1', object: 'chat.completion.chunk', model: 'vendor/model', choices: [{ index: 0, delta: { content }, finish_reason: finish }] };
}

async function failureOf(iterable: AsyncIterable<unknown>): Promise<ProviderCallError> {
  try {
    await collect(iterable);
  } catch (error) {
    if (error instanceof ProviderCallError) return error;
    throw error;
  }
  throw new ProviderCallError({ retryable: false, message: 'expected the stream to fail' });
}

describe('readSseData', () => {
  it('should reassemble events split at every byte', async () => {
    const text = 'data: {"a":1}\n\ndata: {"b":2}\n\n';

    expect(await collect(readSseData(streamOf(...text.split(''))))).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('should join multi-line data with newlines', async () => {
    expect(await collect(readSseData(streamOf('data: first\ndata: second\n\n')))).toEqual(['first\nsecond']);
  });

  it('should end a line at a CR at once, without waiting to see whether an LF follows', async () => {
    const controller = new AbortController();
    const { stream } = openStreamOf('data: a\r\r');
    const seen: string[] = [];

    for await (const data of readSseData(stream, controller.signal)) {
      seen.push(data);
      controller.abort();
    }

    expect(seen).toEqual(['a']);
  });

  it('should stop before the next event once aborted, even within one read', async () => {
    const controller = new AbortController();
    const seen: string[] = [];

    for await (const data of readSseData(streamOf('data: one\n\ndata: two\n\ndata: three\n\n'), controller.signal)) {
      seen.push(data);
      controller.abort();
    }

    expect(seen).toEqual(['one']);
  });

  it('should accept CRLF and bare CR line endings, including a CRLF split across reads', async () => {
    expect(await collect(readSseData(streamOf('data: a\r\n\r\ndata: b\r\rdata: c\r', '\ndata: d\r\n\r\n')))).toEqual(['a', 'b', 'c\nd']);
  });

  it('should skip comments and fields other than data, and take data without a space after the colon', async () => {
    expect(await collect(readSseData(streamOf(': OPENROUTER PROCESSING\n\nevent: message\nid: 7\nretry: 10\ndata:tight\n\n')))).toEqual(['tight']);
  });

  it('should decode a multi-byte character split across reads', async () => {
    const bytes = new TextEncoder().encode('data: héllo ✓\n\n');

    expect(await collect(readSseData(streamOf(bytes.slice(0, 8), bytes.slice(8, 17), bytes.slice(17))))).toEqual(['héllo ✓']);
  });

  it('should deliver an event the stream ends without terminating', async () => {
    expect(await collect(readSseData(streamOf('data: one\n\ndata: tail')))).toEqual(['one', 'tail']);
  });

  it('should end quietly and cancel the upstream when aborted', async () => {
    const controller = new AbortController();
    const { stream, cancelled } = openStreamOf('data: one\n\n');
    const seen: string[] = [];

    for await (const data of readSseData(stream, controller.signal)) {
      seen.push(data);
      controller.abort();
    }

    expect(seen).toEqual(['one']);
    expect(cancelled()).toBe(true);
  });
});

describe('readChatChunks', () => {
  it('should yield content chunks and hold the final usage frame and the gateway block in the state', async () => {
    const state = freshState();
    const body = streamOf(
      sse(
        chunk('Hel'),
        chunk('lo', 'stop'),
        {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
          gateway: { served_by: 'claude', served_model: 'claude-sonnet-5' },
        },
        '[DONE]',
      ),
    );

    const chunks = await collect(readChatChunks(body, state));

    expect(chunks.map(item => (item['choices'] as { delta: { content: string } }[])[0]?.delta.content)).toEqual(['Hel', 'lo']);
    expect(state).toEqual({
      done: true,
      finished: true,
      chunks: 2,
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, reasoningTokens: 0 },
      servedModel: 'claude-sonnet-5',
    });
  });

  it('should relabel each chunk with the response model and strip upstream-only members', async () => {
    const body = streamOf(sse({ ...chunk('x', 'stop'), provider: 'Anthropic', usage: { prompt_tokens: 1, completion_tokens: 1 } }, '[DONE]'));

    const [first] = await collect(readChatChunks(body, freshState(), { responseModel: 'novel-forge.chat' }));

    expect(first).toMatchObject({ model: 'novel-forge.chat' });
    expect(first).not.toContainAnyKeys(['provider', 'usage', 'gateway']);
  });

  it('should stop at [DONE] and ignore anything after it', async () => {
    const chunks = await collect(readChatChunks(streamOf(sse(chunk('a', 'stop'), '[DONE]', chunk('late'))), freshState()));

    expect(chunks).toHaveLength(1);
  });

  it('should fail on a mid-stream error frame as non-retryable once a chunk was handed on', async () => {
    const body = streamOf(sse(chunk('partial'), { error: { message: 'Upstream overloaded', type: 'server_error', code: null } }));

    expect(await failureOf(readChatChunks(body, freshState()))).toMatchObject({ retryable: false, bytesSent: true, message: 'Upstream overloaded' });
  });

  it('should fail on an error frame before any chunk as retryable when the error is transient', async () => {
    const body = streamOf(sse({ error: { message: 'Rate limited', code: 429 } }));

    expect(await failureOf(readChatChunks(body, freshState()))).toMatchObject({ retryable: true, bytesSent: false, status: 429 });
  });

  it('should fail on a malformed frame', async () => {
    expect(await failureOf(readChatChunks(streamOf(sse('{"choices": [')), freshState()))).toMatchObject({ code: 'invalid_response', retryable: false });
  });

  it('should fail a stream that stops short of a finish reason and [DONE]', async () => {
    expect(await failureOf(readChatChunks(streamOf(sse(chunk('cut'))), freshState()))).toMatchObject({ code: 'stream_truncated', bytesSent: true });
  });

  it('should not take a usage frame alone for a finished stream', async () => {
    const body = streamOf(sse(chunk('cut'), { choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }));

    expect(await failureOf(readChatChunks(body, freshState()))).toMatchObject({ code: 'stream_truncated' });
  });

  it('should read usage that arrives on the last content chunk', async () => {
    const state = freshState();

    const chunks = await collect(readChatChunks(streamOf(sse(chunk('a'), { ...chunk('b', 'stop'), usage: { prompt_tokens: 3, completion_tokens: 1 } }, '[DONE]')), state));

    expect(chunks).toHaveLength(2);
    expect(chunks[1]).not.toHaveProperty('usage');
    expect(state.usage).toMatchObject({ inputTokens: 3, outputTokens: 1 });
  });

  it('should keep the last usage seen', async () => {
    const state = freshState();
    const body = streamOf(
      sse({ ...chunk('a'), usage: { prompt_tokens: 3, completion_tokens: 0 } }, chunk('b', 'stop'), { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }, '[DONE]'),
    );

    await collect(readChatChunks(body, state));

    expect(state.usage).toMatchObject({ outputTokens: 2 });
  });

  it('should not take usage on a content chunk for a finished stream', async () => {
    const body = streamOf(sse({ ...chunk('cut'), usage: { prompt_tokens: 3, completion_tokens: 1 } }));

    expect(await failureOf(readChatChunks(body, freshState()))).toMatchObject({ code: 'stream_truncated' });
  });

  it('should yield nothing more once aborted, even for frames already read', async () => {
    const controller = new AbortController();
    const chunks: unknown[] = [];

    for await (const item of readChatChunks(streamOf(sse(chunk('a'), chunk('b'), chunk('c', 'stop'))), freshState(), { signal: controller.signal })) {
      chunks.push(item);
      controller.abort();
    }

    expect(chunks).toHaveLength(1);
  });

  it('should accept a stream that finished without sending [DONE]', async () => {
    const state = freshState();

    expect(await collect(readChatChunks(streamOf(sse(chunk('a', 'stop'))), state))).toHaveLength(1);
    expect(state.done).toBe(false);
  });

  it('should end quietly without a truncation error when aborted', async () => {
    const controller = new AbortController();
    const { stream } = openStreamOf(sse(chunk('a')));
    const chunks: unknown[] = [];

    for await (const item of readChatChunks(stream, freshState(), { signal: controller.signal })) {
      chunks.push(item);
      controller.abort();
    }

    expect(chunks).toHaveLength(1);
  });
});
