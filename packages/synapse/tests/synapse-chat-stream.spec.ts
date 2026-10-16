import { beforeEach, describe, expect, it } from 'bun:test';

import { AppError, ErrorCode } from '@shadow-library/common';
import { type SynapseChatChunk, type SynapseChatRequest, SynapseClient, SynapseError } from '@shadow-library/synapse';

import { failingBody, FakeAuthClient, FakeSynapse, json, sse } from './fakes';
import { FINAL_FRAME, STREAM_CHUNKS, SYNAPSE_BLOCK, USAGE } from './fixtures/synapse-responses';

const REQUEST: SynapseChatRequest = { model: 'novel-forge.chat', messages: [{ role: 'user', content: 'Hi' }], synapse: { subject: { type: 'owner', id: '7' } } };

async function collect(chunks: AsyncIterable<SynapseChatChunk>): Promise<SynapseChatChunk[]> {
  const collected: SynapseChatChunk[] = [];
  for await (const chunk of chunks) collected.push(chunk);
  return collected;
}

const rejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => expect.unreachable(),
    (error: unknown) => error,
  );

describe('SynapseClient.chatStream', () => {
  let synapse: FakeSynapse;
  let client: SynapseClient;

  beforeEach(() => {
    synapse = new FakeSynapse();
    client = new SynapseClient({ authClient: new FakeAuthClient(), fetch: synapse.fetch });
  });

  it('should yield the content chunks and settle final with the closing frame, even across split and CRLF-delimited events', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]'], { sliceBytes: 5, newline: '\r\n' }));
    const stream = await client.chatStream(REQUEST);
    const chunks = await collect(stream);

    expect(chunks.map(chunk => chunk.choices[0]?.delta.content ?? '').join('')).toBe('Hello world');
    expect(chunks).toHaveLength(3);
    expect(await stream.final()).toEqual({ usage: USAGE, synapse: SYNAPSE_BLOCK });
    expect(synapse.requests[0]?.body).toMatchObject({ stream: true });
    expect(synapse.requests[0]?.headers.get('accept')).toBe('text/event-stream');
  });

  it('should read the final frame when the caller never iterates', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const stream = await client.chatStream(REQUEST);

    expect((await stream.final()).synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should settle final without usage when the closing frame carries none', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, { ...FINAL_FRAME, usage: null }, '[DONE]']));
    const stream = await client.chatStream(REQUEST);

    expect(await stream.final()).toEqual({ usage: null, synapse: SYNAPSE_BLOCK });
  });

  it('should throw an error frame as a SynapseError and reject final with it', async () => {
    const errorFrame = { error: { message: 'The upstream provider returned an error', type: 'server_error', code: 'SYN_UPSTREAM_ERROR' } };
    synapse.reply(sse([STREAM_CHUNKS[0] as object, errorFrame]));
    const stream = await client.chatStream(REQUEST);
    const error = await rejection(collect(stream));

    expect(error).toBeInstanceOf(SynapseError);
    expect(error).toMatchObject({ status: 502, code: 'SYN_UPSTREAM_ERROR' });
    expect(await rejection(stream.final())).toBe(error);
  });

  it('should fail a stream that ends without its final frame', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, '[DONE]']));
    const stream = await client.chatStream(REQUEST);
    const error = await rejection(collect(stream));

    expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
    expect(await rejection(stream.final())).toBe(error);
  });

  it('should raise a body that fails mid-stream as the common network error', async () => {
    synapse.reply(failingBody(200, `data: ${JSON.stringify(STREAM_CHUNKS[0])}\n\n`, new TypeError('terminated')));
    const stream = await client.chatStream(REQUEST);
    const error = await rejection(collect(stream));

    expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
    expect(await rejection(stream.final())).toBe(error);
  });

  it('should reject final when the caller stops reading early', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const stream = await client.chatStream(REQUEST);
    for await (const chunk of stream) if (chunk) break;

    expect(AppError.is(await rejection(stream.final()), ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
  });

  it('should refuse a second iteration', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const stream = await client.chatStream(REQUEST);
    await collect(stream);

    expect(() => stream[Symbol.asyncIterator]()).toThrow('a synapse chat stream can be iterated only once');
  });

  it('should throw a refusal before any frame is read', async () => {
    synapse.reply(json({ error: { message: 'The call budget for the current window is exhausted', type: 'rate_limit_error', code: 'SYN_BUDGET_CALLS' } }, 429));

    expect(await rejection(client.chatStream(REQUEST))).toMatchObject({ status: 429, code: 'SYN_BUDGET_CALLS' });
  });
});
