import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { type RestoreConfig, type RestoreLogger, setConfig, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { type InferenceBody } from '@modules/inference/inference.service';
import { type RequestAbort } from '@modules/inference/request-abort';
import { type ChatRequestBody } from '@modules/providers/provider.types';

import { APP, catalogDocument, chunk, envelope, failureOf, FakeSink, hanging, harness, json, openSse, type Responder, sse } from './inference.fixtures';

const UPSTREAM_USAGE = { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, prompt_tokens_details: { cached_tokens: 400 } };
const COMPLETION = {
  id: 'chatcmpl-up',
  object: 'chat.completion',
  created: 1,
  model: 'vendor/opus',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }],
  usage: UPSTREAM_USAGE,
};

function chatBody(overrides: Partial<InferenceBody<ChatRequestBody>> = {}): InferenceBody<ChatRequestBody> {
  return { model: 'novel-forge.chat', messages: [{ role: 'user', content: 'Hello' }], synapse: envelope(), ...overrides };
}

let restoreLogger: RestoreLogger;
let restoreConfig: RestoreConfig;
beforeAll(() => {
  restoreLogger = silenceLogger();
  restoreConfig = setConfig({ 'synapse.request.timeout-ms': 60_000, 'synapse.provider.openrouter.api-key': 'sk-test' });
});
afterAll(() => {
  restoreConfig();
  restoreLogger();
});

describe('InferenceService.completeChat', () => {
  it('should answer the upstream completion with the task as model, OpenAI usage and the synapse block', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', json(200, COMPLETION));

    const response = await service.completeChat(APP, chatBody({ synapse: envelope({ alias: 'opus', effort: 'max' }) }), begin());

    expect(response).toMatchObject({ id: 'chatcmpl-up', model: 'novel-forge.chat', choices: COMPLETION.choices });
    expect(response['usage']).toEqual({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      prompt_tokens_details: { cached_tokens: 400 },
      completion_tokens_details: { reasoning_tokens: 0 },
    });
    expect(response['synapse']).toEqual({
      request_id: 'req-1',
      task: 'novel-forge.chat',
      alias: 'opus',
      label: 'Opus 5.5',
      model: 'opus',
      provider: 'flaky',
      effort: 'high',
      attempts: 1,
      catalog_version: 7,
      cost: { list_usd: 0.0082, billed_usd: 0.0082 },
    });
    expect(fetcher.calls[0]?.body).toMatchObject({ model: 'vendor/opus' });
    expect(fetcher.calls[0]?.body['synapse']).toBeUndefined();
    expect(repository.settlements[0]?.values).toMatchObject({
      status: 'ok',
      provider: 'flaky',
      deploymentId: 'vendor/opus',
      inputTokens: 1000,
      cachedInputTokens: 400,
      attempts: 1,
      effort: 'high',
    });
  });

  it('should pass unknown top-level members through to the provider', async () => {
    const { service, fetcher, begin } = harness();
    fetcher.on('https://flaky.test', json(200, COMPLETION));
    await service.completeChat(APP, { ...chatBody(), tool_choice: 'auto', logit_bias: { 42: 1 } } as InferenceBody<ChatRequestBody>, begin());
    expect(fetcher.calls[0]?.body).toMatchObject({ tool_choice: 'auto', logit_bias: { 42: 1 } });
  });

  it('should bill what OpenRouter reported while budgets keep counting list price', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://openrouter.test', json(200, { ...COMPLETION, usage: { ...UPSTREAM_USAGE, cost: 0.0004 } }));

    const response = await service.completeChat(APP, chatBody({ model: 'novel-forge.routed' }), begin());

    expect(response['synapse']).toMatchObject({ provider: 'openrouter', effort: null, cost: { list_usd: 0.0014, billed_usd: 0.0004 } });
    expect(repository.settlements[0]?.listCostUsd).toBe(0.0014);
  });

  it('should fail over to the next deployment on a retryable failure', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', json(503, { error: { message: 'overloaded' } }));

    const response = await service.completeChat(APP, chatBody(), begin());

    expect(response['synapse']).toMatchObject({ provider: 'mock', attempts: 2, cost: { billed_usd: 0 } });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', provider: 'mock', deploymentId: 'echo', attempts: 2 });
  });

  it('should fail over on a 400 the gateway marks as an unsupported parameter', async () => {
    const { service, fetcher, begin } = harness();
    fetcher.on('https://flaky.test', json(400, { error: { code: 'unsupported_parameter', message: 'no seed here' } }));
    expect((await service.completeChat(APP, chatBody(), begin()))['synapse']).toMatchObject({ provider: 'mock', attempts: 2 });
  });

  it('should fail over from a deployment at its in-flight cap without calling it', async () => {
    const document = catalogDocument(draft => {
      draft.providers['flaky']!.maxInflightPerReplica = 0;
    });
    const { service, fetcher, providers, begin } = harness(document);

    const response = await service.completeChat(APP, chatBody(), begin());

    expect(response['synapse']).toMatchObject({ provider: 'mock', attempts: 2 });
    expect(fetcher.calls).toHaveLength(0);
    expect(providers.inflightCount('mock')).toBe(0);
  });

  it('should answer an upstream error without failing over when the failure is not retryable', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', json(400, { error: { message: 'bad tool schema' } }));

    const error = await failureOf(service.completeChat(APP, chatBody(), begin()));

    expect(AppError.is(error, AppErrorCode.SYN_UPSTREAM_ERROR)).toBe(true);
    expect((error as AppError).message).toBe('The upstream provider returned an error: bad tool schema');
    expect(fetcher.calls).toHaveLength(1);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_UPSTREAM_ERROR', attempts: 1, provider: 'flaky' });
  });

  it('should report the last upstream reason when every deployment failed over', async () => {
    const document = catalogDocument(draft => {
      draft.models['opus']!.deployments = [
        { provider: 'flaky', id: 'a' },
        { provider: 'flaky', id: 'b' },
      ];
    });
    const { service, fetcher, repository, begin } = harness(document);
    fetcher.on('https://flaky.test', json(429, { error: { message: 'slow down' } }), json(502, { error: { message: 'bad gateway' } }));

    const error = await failureOf(service.completeChat(APP, chatBody(), begin()));

    expect(AppError.is(error, AppErrorCode.SYN_PROVIDERS_EXHAUSTED)).toBe(true);
    expect((error as AppError).message).toBe('Every provider deployment failed: bad gateway');
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_PROVIDERS_EXHAUSTED', attempts: 2 });
  });

  it('should abort the upstream call and settle it cancelled when the caller disconnects', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', hanging);
    const abort = begin();

    const pending = failureOf(service.completeChat(APP, chatBody(), abort));
    await fetcher.untilCalled();
    abort.abort('client');
    await pending;

    expect(fetcher.calls).toHaveLength(1);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled', attempts: 1 });
  });

  it('should answer a timeout as SYN_TIMEOUT and settle it cancelled', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', hanging);
    const abort = begin();

    const pending = failureOf(service.completeChat(APP, chatBody(), abort));
    await fetcher.untilCalled();
    abort.abort('timeout');

    expect(AppError.is(await pending, AppErrorCode.SYN_TIMEOUT)).toBe(true);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled', errorCode: 'SYN_TIMEOUT' });
  });

  it('should neither claim the request id nor spend budget for a caller that hung up before dispatch', async () => {
    for (const call of ['chat', 'stream', 'embedding', 'image'] as const) {
      const { service, fetcher, repository, begin } = harness();
      const abort = begin();
      abort.abort('client');

      const pending =
        call === 'chat'
          ? service.completeChat(APP, chatBody(), abort)
          : call === 'stream'
            ? service.streamChat(APP, chatBody({ stream: true }), abort, new FakeSink())
            : call === 'embedding'
              ? service.embed(APP, { model: 'novel-forge.embedding', input: 'a', synapse: envelope() }, abort)
              : service.generateImages(APP, { model: 'novel-forge.image', prompt: 'a cat', synapse: envelope() }, abort);

      expect([call, AppError.is(await failureOf(pending))]).toEqual([call, true]);
      expect([call, repository.claimed.size, repository.admissions.length, repository.settlements.length, fetcher.calls.length]).toEqual([call, 0, 0, 0, 0]);
    }
  });

  it("should refuse a reused request id before dispatching it, leaving the first call's row alone", async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', json(200, COMPLETION));
    await service.completeChat(APP, chatBody(), begin());

    const error = await failureOf(service.completeChat(APP, chatBody(), begin()));

    expect(AppError.is(error, AppErrorCode.SYN_DUPLICATE_REQUEST)).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect(repository.settlements).toHaveLength(1);
  });

  it('should settle a call refused over budget as refused, without dispatching it', async () => {
    const { service, fetcher, repository, begin } = harness();
    repository.refuse = request => ({ request, counter: { calls: 1000, listCostUsd: 3 } });

    const error = await failureOf(service.completeChat(APP, chatBody(), begin()));

    expect(AppError.is(error, AppErrorCode.SYN_BUDGET_CALLS)).toBe(true);
    expect(fetcher.calls).toHaveLength(0);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'refused', errorCode: 'SYN_BUDGET_CALLS', attempts: 0 });
  });

  it('should charge the list cost to every counter admission counted', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', json(200, COMPLETION));
    await service.completeChat(APP, chatBody(), begin());
    expect(repository.settlements[0]?.charged).toEqual([expect.objectContaining({ app: APP, subjectType: 'owner', subjectId: 'o-1', window: '1h' })]);
  });

  it('should refuse a task of another kind on the chat route, before claiming the request id', async () => {
    const { service, repository, begin } = harness();
    const error = await failureOf(service.completeChat(APP, chatBody({ model: 'novel-forge.embedding' }), begin()));
    expect(AppError.is(error, AppErrorCode.SYN_INVALID_REQUEST)).toBe(true);
    expect((error as AppError).data).toMatchObject({ param: 'model' });
    expect(repository.claimed.size).toBe(0);
  });

  it("should refuse another app's task and answer SYN_NO_ACTIVE_CATALOG before any catalog is published", async () => {
    expect(AppError.is(await failureOf(harness().service.completeChat('memoir', chatBody(), harness().begin())), AppErrorCode.SYN_TASK_FORBIDDEN)).toBe(true);
    const empty = harness(null);
    expect(AppError.is(await failureOf(empty.service.completeChat(APP, chatBody(), empty.begin())), AppErrorCode.SYN_NO_ACTIVE_CATALOG)).toBe(true);
  });

  it("should answer a malformed session as the caller's invalid request", async () => {
    const document = catalogDocument(draft => {
      draft.providers['flaky'] = { kind: 'openai', flavor: 'subscription-gateway', url: 'http://gateway.test/v1', locality: 'host', cost: 'zero', features: ['sessions'] };
    });
    const { service, repository, begin } = harness(document);

    const error = await failureOf(service.completeChat(APP, chatBody({ synapse: envelope({ session: 'has spaces' }) }), begin()));

    expect(AppError.is(error, AppErrorCode.SYN_INVALID_REQUEST)).toBe(true);
    expect((error as AppError).data).toMatchObject({ param: 'synapse.session' });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_INVALID_REQUEST' });
  });
});

describe('InferenceService.streamChat', () => {
  it('should relay the chunks as the task, then one choice-less frame with usage and the synapse block, then [DONE]', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', sse(chunk('Hel'), chunk('lo', 'stop'), { choices: [], usage: UPSTREAM_USAGE }, '[DONE]'));
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    const frames = sink.parsed();
    expect(frames.slice(0, 2).map(frame => [frame['model'], frame['choices']])).toEqual([
      ['novel-forge.chat', [{ index: 0, delta: { content: 'Hel' }, finish_reason: null }]],
      ['novel-forge.chat', [{ index: 0, delta: { content: 'lo' }, finish_reason: 'stop' }]],
    ]);
    expect(frames[2]).toEqual({
      id: 'chatcmpl-up',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'novel-forge.chat',
      choices: [],
      usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 0 } },
      synapse: expect.objectContaining({ request_id: 'req-1', provider: 'flaky', attempts: 1, cost: { list_usd: 0.0082, billed_usd: 0.0082 } }),
    });
    expect(sink.frames.at(-1)).toBe('[DONE]');
    expect([sink.opened, sink.ended]).toEqual([1, 1]);
    expect(fetcher.calls[0]?.body['stream_options']).toEqual({ include_usage: true });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', stream: true, outputTokens: 200 });
    expect(repository.settlements[0]?.values.ttftMs).toBeNumber();
  });

  it('should fail over before the first chunk, committing to the stream only once one arrives', async () => {
    const { service, fetcher, begin } = harness();
    fetcher.on('https://flaky.test', sse({ error: { message: 'overloaded', type: 'server_error' } }));
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    expect(sink.opened).toBe(1);
    expect(sink.parsed().at(-1)?.['synapse']).toMatchObject({ provider: 'mock', attempts: 2 });
    expect(sink.frames.at(-1)).toBe('[DONE]');
  });

  it('should answer a failure before the first chunk through the error handler, without opening the stream', async () => {
    const document = catalogDocument(draft => {
      draft.models['opus']!.deployments = [{ provider: 'flaky', id: 'vendor/opus' }];
    });
    const { service, fetcher, begin } = harness(document);
    fetcher.on('https://flaky.test', json(503, { error: { message: 'overloaded' } }));
    const sink = new FakeSink();

    const error = await failureOf(service.streamChat(APP, chatBody({ stream: true }), begin(), sink));

    expect(AppError.is(error, AppErrorCode.SYN_PROVIDERS_EXHAUSTED)).toBe(true);
    expect(sink.opened).toBe(0);
  });

  it('should end with an error frame and no [DONE] when the upstream fails after the first chunk, never failing over', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', sse(chunk('Hel'), { error: { message: 'overloaded', type: 'server_error', code: 503 } }));
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    expect(sink.parsed().at(-1)).toEqual({ error: { message: 'The upstream provider returned an error: overloaded', type: 'server_error', code: 'SYN_UPSTREAM_ERROR' } });
    expect(sink.frames).not.toContain('[DONE]');
    expect(fetcher.calls).toHaveLength(1);
    expect(sink.ended).toBe(1);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_UPSTREAM_ERROR', attempts: 1 });
  });

  it('should abort the upstream and settle cancelled when the caller disconnects mid-stream, writing nothing more', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', openSse(chunk('Hel')));
    const abort = begin();
    const sink = new FakeSink();
    sink.onSend = () => {
      abort.abort('client');
      return 'written';
    };

    await service.streamChat(APP, chatBody({ stream: true }), abort, sink);

    expect(sink.frames).toHaveLength(1);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled', attempts: 1 });
  });

  it('should cut a caller that stopped reading and settle the call cancelled', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', openSse(chunk('Hel'), chunk('lo')));
    const abort = begin();
    const sink = new FakeSink();
    sink.onSend = (_data, index) => (index === 0 ? 'written' : 'stalled');

    await service.streamChat(APP, chatBody({ stream: true }), abort, sink);

    expect(abort.cause).toBe('stalled');
    expect(sink.frames).toHaveLength(1);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled' });
  });

  it('should tell a caller still connected that its stream timed out', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', openSse(chunk('Hel')));
    const abort = begin();
    const sink = new FakeSink();
    sink.onSend = () => {
      abort.abort('timeout');
      return 'written';
    };

    await service.streamChat(APP, chatBody({ stream: true }), abort, sink);

    expect(sink.parsed().at(-1)).toEqual({ error: { message: 'The request timed out', type: 'server_error', code: 'SYN_TIMEOUT' } });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled', errorCode: 'SYN_TIMEOUT' });
  });

  it('should tell a caller still connected why a shutdown ended its stream', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://flaky.test', openSse(chunk('Hel')));
    const abort = begin();
    const sink = new FakeSink();
    sink.onSend = () => {
      abort.abort('shutdown');
      return 'written';
    };

    await service.streamChat(APP, chatBody({ stream: true }), abort, sink);

    expect(sink.parsed().at(-1)).toEqual({
      error: { message: 'Every provider deployment failed: Synapse is shutting down; retry the call', type: 'server_error', code: 'SYN_PROVIDERS_EXHAUSTED' },
    });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'cancelled', errorCode: 'SYN_PROVIDERS_EXHAUSTED' });
  });

  it('should settle a stream whose sink cannot open, release its provider slot and answer through the error handler', async () => {
    const { service, fetcher, repository, providers, begin } = harness();
    fetcher.on('https://flaky.test', openSse(chunk('Hel')));
    const sink = new FakeSink();
    sink.openFailure = new Error('the reply was already sent');

    const error = await failureOf(service.streamChat(APP, chatBody({ stream: true }), begin(), sink));

    expect(AppError.is(error) && error.isInternal).toBe(true);
    expect(providers.inflightCount('flaky')).toBe(0);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'INTERNAL' });
  });

  it('should release the provider slot however the stream ends', async () => {
    const outcomes: [string, (sink: FakeSink, abort: RequestAbort) => void, Responder][] = [
      ['ok', () => undefined, sse(chunk('Hel', 'stop'), '[DONE]')],
      ['upstream error', () => undefined, sse(chunk('Hel'), { error: { message: 'overloaded', code: 503 } })],
      ['cancelled', (sink, abort) => (sink.onSend = () => (abort.abort('client'), 'written')), openSse(chunk('Hel'))],
      ['stalled', sink => (sink.onSend = (_data, index) => (index === 0 ? 'written' : 'stalled')), openSse(chunk('Hel'), chunk('lo'))],
      ['failed over', () => undefined, json(503, { error: { message: 'overloaded' } })],
    ];
    for (const [outcome, arrange, responder] of outcomes) {
      const { service, fetcher, providers, begin } = harness();
      fetcher.on('https://flaky.test', responder);
      const abort = begin();
      const sink = new FakeSink();
      arrange(sink, abort);

      await service.streamChat(APP, chatBody({ stream: true }), abort, sink);

      expect([outcome, providers.inflightCount('flaky'), providers.inflightCount('mock')]).toEqual([outcome, 0, 0]);
    }
  });

  it('should close a stream that produced no chunk with the final frame and [DONE]', async () => {
    const { service, fetcher, begin } = harness();
    fetcher.on('https://flaky.test', sse('[DONE]'));
    const sink = new FakeSink();

    await service.streamChat(APP, chatBody({ stream: true }), begin(), sink);

    expect(sink.parsed()).toEqual([expect.objectContaining({ id: 'chatcmpl-req-1', choices: [], usage: null })]);
    expect(sink.frames.at(-1)).toBe('[DONE]');
  });
});

describe('InferenceService.embed', () => {
  it('should answer the vectors with the task as model and the catalog dimensions in the synapse block', async () => {
    const { service, repository, begin } = harness();

    const response = await service.embed(APP, { model: 'novel-forge.embedding', input: ['a', 'b'], synapse: envelope() }, begin());

    expect(response['model']).toBe('novel-forge.embedding');
    expect(response['data']).toHaveLength(2);
    expect(response['usage']).toEqual({ prompt_tokens: 10, total_tokens: 10 });
    expect(response['synapse']).toMatchObject({ provider: 'mock', dimensions: 8, effort: null, cost: { list_usd: 0, billed_usd: 0 } });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', inputTokens: 10, stream: false });
  });
});

describe('InferenceService.embed failures', () => {
  const twoDeployments = catalogDocument(draft => {
    draft.models['embedder']!.deployments = [
      { provider: 'flaky', id: 'vendor/embed' },
      { provider: 'mock', id: 'embed' },
    ];
  });

  it('should fail over to the next deployment and settle with both attempts', async () => {
    const { service, fetcher, repository, begin } = harness(twoDeployments);
    fetcher.on('https://flaky.test', json(503, { error: { message: 'overloaded' } }));

    const response = await service.embed(APP, { model: 'novel-forge.embedding', input: 'a', synapse: envelope() }, begin());

    expect(response['synapse']).toMatchObject({ provider: 'mock', attempts: 2 });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', provider: 'mock', attempts: 2 });
  });

  it('should settle a refused embedding as an upstream error', async () => {
    const { service, fetcher, repository, begin } = harness(twoDeployments);
    fetcher.on('https://flaky.test', json(400, { error: { message: 'input too long' } }));

    const error = await failureOf(service.embed(APP, { model: 'novel-forge.embedding', input: 'a', synapse: envelope() }, begin()));

    expect((error as AppError).message).toBe('The upstream provider returned an error: input too long');
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_UPSTREAM_ERROR', provider: 'flaky', attempts: 1 });
  });
});

describe('InferenceService.generateImages', () => {
  it("should price every generated image at the model's per-image price and bill the upstream's cost", async () => {
    const { service, fetcher, repository, begin } = harness();
    const image = { b64_json: 'aGk=', media_type: 'image/webp' };
    fetcher.on('https://openrouter.test/api/v1/images', json(200, { data: [image, image, image], usage: { cost: 0.09 } }));

    const response = await service.generateImages(APP, { model: 'novel-forge.image', prompt: 'a cat', n: 3, synapse: envelope() }, begin());

    expect(response.data).toEqual([image, image, image]);
    expect(response.usage).toEqual({ cost: 0.09 });
    expect(response.synapse).toMatchObject({ provider: 'openrouter', cost: { list_usd: 0.12, billed_usd: 0.09 } });
    expect(repository.settlements[0]?.listCostUsd).toBe(0.12);
  });

  it('should bill the list price when the upstream reported no cost, counting the images it actually returned', async () => {
    const { service, fetcher, begin } = harness();
    fetcher.on('https://openrouter.test/api/v1/images', json(200, { data: [{ b64_json: 'aGk=' }] }));
    const response = await service.generateImages(APP, { model: 'novel-forge.image', prompt: 'a cat', n: 2, synapse: envelope() }, begin());
    expect(response.synapse.cost).toEqual({ list_usd: 0.04, billed_usd: 0.04 });
  });

  it('should fail over from a failing image provider and bill the zero-cost one nothing', async () => {
    const document = catalogDocument(draft => {
      draft.models['painter']!.deployments.push({ provider: 'mock', id: 'mock-image' });
    });
    const { service, fetcher, repository, begin } = harness(document);
    fetcher.on('https://openrouter.test/api/v1/images', json(502, { error: { message: 'bad gateway' } }));

    const response = await service.generateImages(APP, { model: 'novel-forge.image', prompt: 'a cat', n: 2, synapse: envelope() }, begin());

    expect(response.synapse).toMatchObject({ provider: 'mock', attempts: 2, cost: { list_usd: 0.08, billed_usd: 0 } });
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'ok', provider: 'mock', attempts: 2, listCostUsd: 0.08 });
  });

  it('should settle a refused image generation as an upstream error', async () => {
    const { service, fetcher, repository, begin } = harness();
    fetcher.on('https://openrouter.test/api/v1/images', json(400, { error: { message: 'prompt refused' } }));

    const error = await failureOf(service.generateImages(APP, { model: 'novel-forge.image', prompt: 'a cat', synapse: envelope() }, begin()));

    expect(AppError.is(error, AppErrorCode.SYN_UPSTREAM_ERROR)).toBe(true);
    expect(repository.settlements[0]?.values).toMatchObject({ status: 'error', errorCode: 'SYN_UPSTREAM_ERROR', listCostUsd: 0 });
  });
});
