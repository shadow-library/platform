import { describe, expect, it } from 'bun:test';

import { AppError, Config } from '@shadow-library/common';
import { type SynapseChatRequest, type SynapseChatResponse, type SynapseClient, SynapseError } from '@shadow-library/synapse';

import { type InferenceRequest, SynapseInferenceClient } from '@modules/inference';
import { AppErrorCode } from '@server/classes';

interface Call {
  body: SynapseChatRequest;
  signal?: AbortSignal;
}

const REQUEST: InferenceRequest = { task: 'memoir.insight', subjectId: 'user-1', plan: 'paid', systemPrompt: 'system text', userPrompt: 'user text' };

function response(overrides: { content?: string | null; refusal?: string | null; model?: string; finish?: string } = {}): SynapseChatResponse {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'alias-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: overrides.content === undefined ? '{"answer":"ok"}' : overrides.content, refusal: overrides.refusal },
        finish_reason: overrides.finish ?? 'stop',
      },
    ],
    synapse: { model: overrides.model ?? 'claude-haiku' } as SynapseChatResponse['synapse'],
  };
}

function fakeSynapse(outcome: SynapseChatResponse | Error | ((signal?: AbortSignal) => Promise<SynapseChatResponse>)) {
  const calls: Call[] = [];
  const client = {
    chat: async (body: SynapseChatRequest, options?: { signal?: AbortSignal }) => {
      calls.push({ body, signal: options?.signal });
      if (typeof outcome === 'function') return outcome(options?.signal);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  } as unknown as SynapseClient;
  return { calls, inference: new SynapseInferenceClient(client) };
}

async function failure(inference: SynapseInferenceClient): Promise<AppError> {
  const error = await inference.completeJson(REQUEST).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('SynapseInferenceClient', () => {
  it('should send the task as the model with the plan selector, user subject and json response format', async () => {
    const { calls, inference } = fakeSynapse(response());
    await inference.completeJson(REQUEST);

    expect(calls[0]?.body).toEqual({
      model: 'memoir.insight',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'system text' },
        { role: 'user', content: 'user text' },
      ],
      synapse: { subject: { type: 'user', id: 'user-1' }, selectors: { plan: 'paid' } },
    });
  });

  it('should address receipt structuring as its own task on the free plan', async () => {
    const { calls, inference } = fakeSynapse(response());
    await inference.completeJson({ ...REQUEST, task: 'memoir.receipt-structuring', plan: 'free' });

    expect(calls[0]?.body.model).toBe('memoir.receipt-structuring');
    expect(calls[0]?.body.synapse.selectors).toEqual({ plan: 'free' });
  });

  it('should parse the first choice as json and record the model that answered', async () => {
    const { inference } = fakeSynapse(response({ content: '{"answer":"hello"}', model: 'gpt-mini' }));
    expect(await inference.completeJson(REQUEST)).toEqual({ content: { answer: 'hello' }, model: 'gpt-mini' });
  });

  it('should treat empty or non-json content as a retryable failure', async () => {
    for (const content of [null, '', 'not json']) {
      const error = await failure(fakeSynapse(response({ content })).inference);
      expect(error.code).toBe(AppErrorCode.AI_009.code);
    }
  });

  it('should treat a model refusal as terminal', async () => {
    const error = await failure(fakeSynapse(response({ content: null, refusal: 'I cannot help' })).inference);
    expect(error.code).toBe(AppErrorCode.AI_013.code);
  });

  it('should treat a content_filter finish as terminal', async () => {
    const error = await failure(fakeSynapse(response({ content: '{"answer":"x"}', finish: 'content_filter' })).inference);
    expect(error.code).toBe(AppErrorCode.AI_013.code);
  });

  const cases: [string, number, string][] = [
    ['SYN_INVALID_REQUEST', 400, 'AI_013'],
    ['SYN_POLICY_DENIED', 403, 'AI_013'],
    ['SYN_BUDGET_CALLS', 429, 'AI_009'],
    ['SYN_BUDGET_COST', 429, 'AI_009'],
    ['SYN_PROVIDERS_EXHAUSTED', 503, 'AI_009'],
    ['SYN_UPSTREAM_ERROR', 502, 'AI_009'],
    ['SYN_TIMEOUT', 504, 'AI_009'],
    ['SYN_NO_ACTIVE_CATALOG', 503, 'AI_009'],
    ['SYN_NO_ELIGIBLE_MODEL', 422, 'AI_009'],
    ['SYN_UNKNOWN_TASK', 404, 'AI_009'],
    ['SYN_TASK_FORBIDDEN', 403, 'AI_009'],
    ['SYN_DUPLICATE_REQUEST', 409, 'AI_009'],
    ['SOMETHING_UNRECOGNISED', 401, 'AI_009'],
  ];

  for (const [code, status, expected] of cases) {
    it(`should map ${code} to ${expected}`, async () => {
      const error = await failure(fakeSynapse(new SynapseError(status, code, 'boom')).inference);
      expect(error.code).toBe(expected);
    });
  }

  it('should map a transport failure to the retryable code', async () => {
    const error = await failure(fakeSynapse(new Error('connection reset')).inference);
    expect(error.code).toBe(AppErrorCode.AI_009.code);
  });

  it('should abort the call once ai.inference-timeout-ms elapses', async () => {
    Config['cache'].set('ai.inference-timeout-ms', 1);
    try {
      const { calls, inference } = fakeSynapse(signal => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason as Error))));
      const error = await failure(inference);

      expect(calls[0]?.signal?.aborted).toBe(true);
      expect(error.code).toBe(AppErrorCode.AI_009.code);
    } finally {
      Config['cache'].set('ai.inference-timeout-ms', 120000);
    }
  });
});
