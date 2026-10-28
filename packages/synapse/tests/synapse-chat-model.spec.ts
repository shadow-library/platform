import { beforeEach, describe, expect, it } from 'bun:test';

import { type AIMessageChunk, HumanMessage } from '@langchain/core/messages';
import { concat } from '@langchain/core/utils/stream';
import { AppError, ErrorCode } from '@shadow-library/common';
import { SynapseClient, SynapseError } from '@shadow-library/synapse';
import { isSynapseReset, SynapseChatModel, type SynapseChatModelFields, type SynapseRequestHook } from '@shadow-library/synapse/langchain';

import { FakeAuthClient, FakeSynapse, json, sse } from './fakes';
import { CHAT_COMPLETION, FINAL_FRAME, RESET_FRAME, SEARCH_PREAMBLE, STREAM_CHUNKS, SYNAPSE_BLOCK } from './fixtures/synapse-responses';

const ENVELOPE = { subject: { type: 'owner' as const, id: '7' }, selectors: { tier: 'balanced' }, alias: 'opus' };

const GUARD_LINE = 'Never cross the hard line.';

const prependGuardLine: SynapseRequestHook = async request => ({ ...request, messages: [{ role: 'system', content: GUARD_LINE }, ...request.messages] });

const rejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => expect.unreachable(),
    (error: unknown) => error,
  );

async function aggregate(stream: AsyncIterable<AIMessageChunk> | Iterable<AIMessageChunk>): Promise<AIMessageChunk> {
  let aggregated: AIMessageChunk | undefined;
  for await (const chunk of stream) aggregated = aggregated ? concat(aggregated, chunk) : chunk;
  return aggregated ?? expect.unreachable();
}

describe('SynapseChatModel', () => {
  let auth: FakeAuthClient;
  let synapse: FakeSynapse;
  let model: (fields?: Partial<SynapseChatModelFields>) => SynapseChatModel;

  beforeEach(() => {
    auth = new FakeAuthClient();
    synapse = new FakeSynapse();
    const client = new SynapseClient({ authClient: auth, fetch: synapse.fetch });
    model = fields => new SynapseChatModel({ client, task: 'novel-forge.chat', envelope: ENVELOPE, ...fields });
  });

  it('should send the task as the model and the envelope beside the OpenAI fields, to the resolved synapse base', async () => {
    synapse.reply(json(CHAT_COMPLETION));
    await model({ temperature: 0.4 }).invoke('Hi');

    expect(synapse.requests[0]?.url).toBe('http://synapse-server.synapse/api/v1/chat/completions');
    expect(synapse.requests[0]?.body).toMatchObject({ model: 'novel-forge.chat', temperature: 0.4, messages: [{ role: 'user', content: 'Hi' }], synapse: ENVELOPE });
  });

  it('should pass strict selector keys through in the envelope', async () => {
    synapse.reply(json(CHAT_COMPLETION));
    const envelope = { ...ENVELOPE, selectors: { content_mode: 'unrestricted' }, strict: ['content_mode'] };
    await model({ envelope }).invoke('Hi');

    expect(synapse.requests[0]?.body?.synapse).toMatchObject({ selectors: { content_mode: 'unrestricted' }, strict: ['content_mode'] });
  });

  it('should send a fresh request_id per invocation of one instance, its bindTools copy included', async () => {
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const llm = model();
    await llm.invoke('Hi');
    await llm.invoke('Hi');
    await llm.bindTools([{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }]).invoke('Hi');

    const ids = synapse.requests.map(sent => (sent.body?.synapse as { request_id?: string }).request_id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(synapse.requests[2]?.body?.tools).toHaveLength(1);
  });

  it('should stay on chat completions where ChatOpenAI would switch to the Responses API', async () => {
    synapse.reply(json(CHAT_COMPLETION));
    const message = await model({ reasoning: { summary: 'auto' } }).invoke('Hi');

    expect(synapse.requests[0]?.url).toBe('http://synapse-server.synapse/api/v1/chat/completions');
    expect(message.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should replace a request_id smuggled into the envelope with a fresh one per request', async () => {
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const pinned = { ...ENVELOPE, request_id: 'pinned' };
    const llm = model({ envelope: pinned });
    await llm.invoke('Hi');
    await llm.invoke('Hi');

    const ids = synapse.requests.map(sent => (sent.body?.synapse as { request_id: string }).request_id);
    expect(ids).not.toContain('pinned');
    expect(new Set(ids).size).toBe(2);
  });

  it('should make exactly one request when a call asks the SDK for retries', async () => {
    const unavailable = json({ error: { message: 'No catalog has been published', type: 'server_error', code: 'SYN_NO_ACTIVE_CATALOG' } }, 503);
    synapse.reply(unavailable, unavailable, unavailable, unavailable);
    const error = await rejection(model().invoke('Hi', { options: { maxRetries: 3 } }));

    expect(error).toMatchObject({ status: 503, code: 'SYN_NO_ACTIVE_CATALOG' });
    expect(synapse.requests).toHaveLength(1);
  });

  it('should raise a context-length upstream error as a SynapseError, not as the ContextOverflowError LangChain makes of it', async () => {
    const message = "This model's maximum context length is 200000 tokens";
    synapse.reply(json({ error: { message, type: 'server_error', code: 'SYN_UPSTREAM_ERROR' } }, 502));
    const error = await rejection(model().invoke('Hi'));

    expect(error).toBeInstanceOf(SynapseError);
    expect(error).toMatchObject({ status: 502, code: 'SYN_UPSTREAM_ERROR', message });
  });

  it('should send a token from the client on every request, never the sdk key', async () => {
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const llm = model();
    await llm.invoke('Hi');
    await llm.invoke('Hi');

    expect(synapse.requests.map(sent => sent.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2']);
    expect(auth.requests).toHaveLength(2);
  });

  it('should expose the synapse block on response_metadata and generationInfo of an invoke', async () => {
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const message = await model().invoke('Hi');
    const result = await model().generate([[new HumanMessage('Hi')]]);

    expect(message.content).toBe('Hello world');
    expect(message.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
    expect(message.usage_metadata).toMatchObject({ input_tokens: 12, output_tokens: 3, total_tokens: 15 });
    expect(result.generations[0]?.[0]?.generationInfo?.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should keep the raw response on additional_kwargs when asked to', async () => {
    synapse.reply(json(CHAT_COMPLETION));
    const message = await model({ __includeRawResponse: true }).invoke('Hi');

    expect(message.additional_kwargs.__raw_response).toMatchObject({ usage: CHAT_COMPLETION.usage, synapse: SYNAPSE_BLOCK });
  });

  it('should hand back a non-json reply to a json_schema request rather than fail parsing it', async () => {
    const prose = { ...CHAT_COMPLETION, choices: [{ ...CHAT_COMPLETION.choices[0], message: { role: 'assistant', content: 'Sure! {"ok":true}', refusal: null } }] };
    synapse.reply(json(prose));
    const responseFormat = { type: 'json_schema', json_schema: { name: 'answer', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } };
    const message = await model({ modelKwargs: { response_format: responseFormat } }).invoke('Hi');

    expect(message.content).toBe('Sure! {"ok":true}');
    expect(message.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should land the final frame of a stream on the usage chunk, once', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const chunks: AIMessageChunk[] = [];
    for await (const chunk of await model().stream('Hi')) chunks.push(chunk);
    const aggregated = await aggregate(chunks);

    expect(aggregated.content).toBe('Hello world');
    expect(aggregated.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
    expect(aggregated.usage_metadata).toMatchObject({ input_tokens: 12, output_tokens: 3 });
    expect(chunks.filter(chunk => chunk.response_metadata.synapse)).toHaveLength(1);
    expect(synapse.requests[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true }, synapse: ENVELOPE });
  });

  it('should still carry the synapse block on a stream whose final frame reports no usage', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, { ...FINAL_FRAME, usage: null }, '[DONE]']));
    const aggregated = await aggregate(await model().stream('Hi'));

    expect(aggregated.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should hand a reset on as an empty chunk between the text it voids and the text that follows', async () => {
    synapse.reply(sse([SEARCH_PREAMBLE, RESET_FRAME, ...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const chunks: AIMessageChunk[] = [];
    for await (const chunk of await model().stream('Hi')) chunks.push(chunk);
    const reset = chunks.findIndex(chunk => isSynapseReset(chunk));

    expect(chunks.filter(chunk => isSynapseReset(chunk))).toHaveLength(1);
    expect(
      chunks
        .slice(0, reset)
        .map(chunk => chunk.content)
        .join(''),
    ).toBe('Let me look that up.');
    expect(
      chunks
        .slice(reset + 1)
        .map(chunk => chunk.content)
        .join(''),
    ).toBe('Hello world');
    expect(chunks[reset]?.content).toBe('');
  });

  it('should keep concurrent streams on one instance apart', async () => {
    const other = { ...SYNAPSE_BLOCK, request_id: 'second' };
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']), sse([...STREAM_CHUNKS, { ...FINAL_FRAME, synapse: other }, '[DONE]']));
    const llm = model();
    const [first, second] = await Promise.all([aggregate(await llm.stream('Hi')), aggregate(await llm.stream('Hi'))]);

    expect(first.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
    expect(second.response_metadata.synapse).toEqual(other);
  });

  it('should carry the synapse block on the message the event stream assembles', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const message = await model().streamEvents('Hi');

    expect(message.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should raise a refusal as a SynapseError without retrying it', async () => {
    synapse.reply(json({ error: { message: 'The cost budget for the current window is exhausted', type: 'rate_limit_error', code: 'SYN_BUDGET_COST' } }, 429));
    const error = await rejection(model().invoke('Hi'));

    expect(error).toBeInstanceOf(SynapseError);
    expect(error).toMatchObject({ status: 429, code: 'SYN_BUDGET_COST' });
    expect(synapse.requests).toHaveLength(1);
  });

  for (const [ending, frames] of [
    ['at end of body', STREAM_CHUNKS],
    ['at [DONE]', [...STREAM_CHUNKS, '[DONE]']],
  ] as const) {
    it(`should fail a stream that ends ${ending} without the synapse frame`, async () => {
      synapse.reply(sse([...frames]), sse([...frames]));
      const streamed = await rejection(aggregate(await model().stream('Hi')));
      const evented = await rejection(Promise.resolve(model().streamEvents('Hi')));

      for (const error of [streamed, evented]) {
        expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
        expect((error as AppError).data?.reason).toBe('the synapse stream ended before its final frame');
      }
    });
  }

  it('should raise an error frame mid-stream as a SynapseError', async () => {
    synapse.reply(sse([STREAM_CHUNKS[0] as object, { error: { message: 'The request timed out', type: 'server_error', code: 'SYN_TIMEOUT' } }]));
    const error = await rejection(aggregate(await model().stream('Hi')));

    expect(error).toBeInstanceOf(SynapseError);
    expect(error).toMatchObject({ status: 502, code: 'SYN_TIMEOUT' });
  });

  it('should retry a refused connection once and surface the network error after that', async () => {
    synapse.refuseConnection().reply(json(CHAT_COMPLETION)).refuseConnection(2);
    await model().invoke('Hi');
    const error = await rejection(model().invoke('Hi'));

    expect(AppError.is(error, ErrorCode.API_REQUEST_NETWORK_ERROR)).toBe(true);
    expect(synapse.requests).toHaveLength(4);
    expect(synapse.requests[1]?.body).toEqual(synapse.requests[0]?.body as Record<string, unknown>);
  });

  it('should surface a token refusal as itself rather than as a connection error', async () => {
    const refused = AppError.internal('token endpoint returned http 400');
    auth.getServiceToken = () => Promise.reject(refused);
    const error = await rejection(model().invoke('Hi'));

    expect(error).toBe(refused);
    expect(synapse.requests).toHaveLength(0);
  });

  it('should send what the request hook returns on invoke, for the bindTools copy too, with the request_id already filled', async () => {
    const seen: unknown[] = [];
    const requestHook: SynapseRequestHook = request => {
      seen.push((request as { synapse?: { request_id?: string } }).synapse?.request_id);
      return prependGuardLine(request);
    };
    synapse.reply(json(CHAT_COMPLETION), json(CHAT_COMPLETION));
    const llm = model({ requestHook });
    await llm.invoke('Hi');
    await llm.bindTools([{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }]).invoke('Hi');

    for (const sent of synapse.requests)
      expect(sent.body?.messages).toEqual([
        { role: 'system', content: GUARD_LINE },
        { role: 'user', content: 'Hi' },
      ]);
    expect(seen).toEqual(synapse.requests.map(sent => (sent.body?.synapse as { request_id: string }).request_id));
    for (const id of seen) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should send what the request hook returns on a stream', async () => {
    synapse.reply(sse([...STREAM_CHUNKS, FINAL_FRAME, '[DONE]']));
    const aggregated = await aggregate(await model({ requestHook: prependGuardLine }).stream('Hi'));

    expect(synapse.requests[0]?.body).toMatchObject({
      stream: true,
      messages: [
        { role: 'system', content: GUARD_LINE },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(aggregated.response_metadata.synapse).toEqual(SYNAPSE_BLOCK);
  });

  it('should let a refusal thrown by the request hook surface as itself and send nothing', async () => {
    const refused = AppError.internal('the request crosses the hard line');
    const requestHook: SynapseRequestHook = () => {
      throw refused;
    };
    const invoked = await rejection(model({ requestHook }).invoke('Hi'));
    const streamed = await rejection(model({ requestHook }).stream('Hi').then(aggregate));

    expect(invoked).toBe(refused);
    expect(streamed).toBe(refused);
    expect(synapse.requests).toHaveLength(0);
  });
});
