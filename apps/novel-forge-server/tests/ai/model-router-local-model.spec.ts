import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import { assertModelOverrideTarget } from '@modules/ai/model-override';
import { ModelRouterService, type ProjectConfig } from '@modules/ai/model-router.service';
import { buildChatRefinePrompt, PROMPT_REGISTRY } from '@modules/ai/prompts';
import { BibleContradictionSchema } from '@modules/ai/schemas/bible-contradiction.schema';
import { ChatCompactSchema } from '@modules/ai/schemas/chat-refine.schema';
import { type JudgeOutput } from '@modules/ai/schemas/judge.schema';
import { toConstrainedSchema, toHostedPromptSchema } from '@modules/ai/schemas/validate';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';
import { Config } from '@shadow-library/common';

type Json = Record<string, unknown>;

interface WireRequest {
  body: Json;
  text: string;
}

const CONFIG_KEYS = ['ai.openrouter.api.key', 'ai.openrouter.api.url', 'ai.model-override', 'ai.structured-output'] as const;
const LOGICAL_MODEL = 'anthropic/claude-sonnet-5';
const PINNED: ProjectConfig = { config: { models: { judge: { provider: 'openrouter', model: LOGICAL_MODEL }, chat: { provider: 'openrouter', model: LOGICAL_MODEL } } } };
const JUDGE_CTX = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
const CHAT_CTX = { projectId: BigInt(1), promptKey: 'chat-refine', promptVersion: '2.13.0', role: 'chat' };
const JUDGE_ANSWER = JSON.stringify({ verdict: 'consistent', findings: [] });
const CHAT_ANSWER = JSON.stringify({ reply: 'Agreed.' });
const judgePrompt = { ...PROMPT_REGISTRY.judge, template: { formatMessages: async () => [new HumanMessage('Judge this.')] } as never };
const chatPrompt = { ...buildChatRefinePrompt('project'), template: { formatMessages: async () => [new HumanMessage('Refine this.')] } as never };

const SUMMARY = JSON.stringify({ summary: 'Consistent.' });
const TOOL = { type: 'function', function: { name: 'noop', description: 'Does nothing.', parameters: { type: 'object', properties: {} } } };
const goldenJudge = {
  key: 'judge' as const,
  version: '1.0.0',
  kind: 'analytical' as const,
  system: 'test',
  schema: ChatCompactSchema,
  cacheStrategy: { stableVars: [] },
  template: { formatMessages: async () => [new SystemMessage('Judge carefully.'), new HumanMessage('Judge this.')] } as never,
};
const goldenChat = {
  key: 'chat-refine' as const,
  version: '2.13.0',
  kind: 'authoring' as const,
  role: 'chat' as const,
  system: 'test',
  schema: ChatCompactSchema,
  template: { formatMessages: async () => [new HumanMessage('Refine this.')] } as never,
};

// Captured from main a4a40852 with both settings unset: the same three calls, fetch-captured, against the tree with this change reverse-applied.
const MAIN_STRUCTURED_BODY = {
  model: 'anthropic/claude-sonnet-5',
  stream: false,
  reasoning: {
    effort: 'low',
  },
  messages: [
    {
      role: 'system',
      content: 'Judge carefully.',
    },
    {
      role: 'user',
      content: 'Judge this.',
    },
    {
      role: 'user',
      content:
        'Respond with ONLY one valid JSON object matching this JSON schema — all prose goes inside the JSON string fields, nothing outside the JSON, no markdown fences:\n{"type":"object","additionalProperties":false,"properties":{"summary":{"type":"string","minLength":1,"description":"the folded summary: decisions made, directions rejected, open questions — dense, factual, no prose flourish"}},"required":["summary"]}',
    },
  ],
};
const MAIN_STREAMED_BODY = {
  model: 'anthropic/claude-sonnet-5',
  stream: true,
  stream_options: {
    include_usage: true,
  },
  reasoning: {
    effort: 'low',
  },
  messages: [
    {
      role: 'user',
      content: 'Refine this.',
    },
    {
      role: 'user',
      content:
        'Respond with ONLY one valid JSON object matching this JSON schema — all prose goes inside the JSON string fields, nothing outside the JSON, no markdown fences:\n{"type":"object","additionalProperties":false,"properties":{"summary":{"type":"string","minLength":1,"description":"the folded summary: decisions made, directions rejected, open questions — dense, factual, no prose flourish"}},"required":["summary"]}',
    },
  ],
};
const MAIN_TOOL_LOOP_BODY = {
  model: 'anthropic/claude-sonnet-5',
  stream: false,
  tools: [
    {
      type: 'function',
      function: {
        name: 'noop',
        description: 'Does nothing.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ],
  reasoning: {
    effort: 'low',
  },
  messages: [
    {
      role: 'user',
      content: 'Judge.',
    },
  ],
};

function config(key: string, value?: unknown): unknown {
  const cache = (Config as unknown as { cache: Map<string, unknown> })['cache'];
  const previous = cache.get(key);
  if (value === undefined) cache.delete(key);
  else cache.set(key, value);
  return previous;
}

function completion(content: string, finishReason = 'stop'): Response {
  const body = { id: 'c', object: 'chat.completion', created: 0, model: 'served', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }] };
  return new Response(JSON.stringify({ ...body, usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { headers: { 'content-type': 'application/json' } });
}

function streamed(content: string): Response {
  const frame = (payload: Json): string => `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'served', ...payload })}\n\n`;
  const text =
    frame({ choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] }) +
    frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
    frame({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) +
    'data: [DONE]\n\n';
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

function wire(...answers: Response[]): WireRequest[] {
  const sent: WireRequest[] = [];
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    const text = String(init?.body);
    sent.push({ text, body: JSON.parse(text) as Json });
    return answers.shift() ?? completion(JUDGE_ANSWER);
  }) as unknown as typeof fetch;
  return sent;
}

function router() {
  const rows: Json[] = [];
  const cached: Json[] = [];
  const db = {
    query: { llmCache: { findFirst: async () => undefined } },
    insert: () => ({
      values: (row: Json) => {
        if ('requestHash' in row) cached.push(row);
        else rows.push(row);
        return Object.assign(Promise.resolve(), { catch: async () => undefined, onConflictDoNothing: async () => undefined });
      },
    }),
  };
  const databaseService = { getPostgresClient: () => db } as never;
  const service = new ModelRouterService(new TelemetryHandler(databaseService), databaseService, { enforce: async () => undefined } as never);
  (service as unknown as Json)['llmBackoffMs'] = 0;
  return { service, rows, cached };
}

describe('ModelRouterService local-model settings', () => {
  const realFetch = globalThis.fetch;
  const saved = new Map<string, unknown>();

  beforeAll(() => {
    for (const key of CONFIG_KEYS) saved.set(key, config(key));
    config('ai.openrouter.api.key', 'test-openrouter-key');
    config('ai.openrouter.api.url', 'http://gateway.invalid/v1');
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    config('ai.model-override');
    config('ai.structured-output');
  });
  afterAll(() => {
    for (const [key, value] of saved) config(key, value);
  });

  it("should send main's exact structured body when neither setting is set", async () => {
    const sent = wire(completion(SUMMARY));

    await router().service.structured(goldenJudge, {}, JUDGE_CTX, PINNED);

    expect(sent[0]?.text).toBe(JSON.stringify(MAIN_STRUCTURED_BODY));
  });

  it("should send main's exact streamed chat-turn body when neither setting is set", async () => {
    const sent = wire(streamed(SUMMARY));

    await router().service.streamStructured(goldenChat, {}, CHAT_CTX, { onDelta: () => undefined }, PINNED);

    expect(sent[0]?.text).toBe(JSON.stringify(MAIN_STREAMED_BODY));
  });

  it("should send main's exact judge tool-loop body when neither setting is set, even with an output module passed", async () => {
    const sent = wire(completion(SUMMARY));

    await (await router().service.chatFor('judge', JUDGE_CTX, PINNED, undefined, PROMPT_REGISTRY.judge)).bindTools?.([TOOL]).invoke([new HumanMessage('Judge.')]);

    expect(sent[0]?.text).toBe(JSON.stringify(MAIN_TOOL_LOOP_BODY));
  });

  it('should send a byte-identical request when structured output is explicitly the default prompt mode', async () => {
    const unset = wire(completion(JUDGE_ANSWER));
    await router().service.structured<JudgeOutput>(judgePrompt, {}, JUDGE_CTX, PINNED);
    config('ai.structured-output', 'prompt');
    const promptMode = wire(completion(JUDGE_ANSWER));
    await router().service.structured<JudgeOutput>(judgePrompt, {}, JUDGE_CTX, PINNED);

    expect(promptMode[0]?.text).toBe(unset[0]?.text as string);
  });

  it('should send the override id with reasoning off while telemetry and the cache keep the logical id', async () => {
    config('ai.model-override', 'nf-e2e');
    const sent = wire(completion(JUDGE_ANSWER));
    const { service, rows, cached } = router();

    await service.structured<JudgeOutput>(judgePrompt, {}, JUDGE_CTX, PINNED);
    await awaitAllCallbacks();

    expect(sent[0]?.body['model']).toBe('nf-e2e');
    expect(sent[0]?.body['reasoning']).toEqual({ effort: 'none' });
    expect(rows.map(row => [row['model'], row['provider'], row['status']])).toEqual([[LOGICAL_MODEL, 'openrouter', 'ok']]);
    expect(cached.map(row => row['model'])).toEqual([LOGICAL_MODEL]);
  });

  it('should turn reasoning off under the override even for a model that sends no reasoning field', () => {
    config('ai.model-override', 'nf-e2e');
    const client = router().service.buildClient({ provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' }, { role: 'title' }) as unknown as Json;

    expect(client['model']).toBe('nf-e2e');
    expect(client['modelKwargs']).toEqual({ reasoning: { effort: 'none' } });
  });

  it('should still refuse a model outside the registry under the override', () => {
    config('ai.model-override', 'nf-e2e');

    expect(() => router().service.buildClient({ provider: 'openrouter', model: 'not-a-real-model' })).toThrow();
  });

  it('should attach the typed wire schema as response_format in json-schema mode and leave the prompt unchanged', async () => {
    const promptMode = wire(completion(CHAT_ANSWER));
    await router().service.structured(chatPrompt, {}, CHAT_CTX, PINNED);
    config('ai.structured-output', 'json-schema');
    const constrained = wire(completion(CHAT_ANSWER));
    await router().service.structured(chatPrompt, {}, CHAT_CTX, PINNED);

    const format = constrained[0]?.body['response_format'] as { type: string; json_schema: { name: string; schema: Json } };
    const properties = format.json_schema.schema['properties'] as Record<string, Json>;
    expect(promptMode[0]?.body['response_format']).toBeUndefined();
    expect(format.type).toBe('json_schema');
    expect(format.json_schema).toEqual({ name: 'chat-refine', schema: toConstrainedSchema(chatPrompt.schema, chatPrompt.constrainedProperties) });
    expect((properties['changeSet']?.['items'] as Json)['anyOf']).toBeArray();
    expect(properties['question']?.['required']).toEqual(['question', 'answers']);
    expect(constrained[0]?.body['messages']).toEqual(promptMode[0]?.body['messages'] as unknown[]);
  });

  it('should show the loose schema in-band whatever the mode, so no prompt changes', async () => {
    config('ai.structured-output', 'json-schema');
    const sent = wire(completion(CHAT_ANSWER));

    await router().service.structured(chatPrompt, {}, CHAT_CTX, PINNED);

    const messages = sent[0]?.body['messages'] as { content: string }[];
    expect(messages.at(-1)?.content).toEndWith(JSON.stringify(toHostedPromptSchema(chatPrompt.schema)));
    expect(toHostedPromptSchema(chatPrompt.schema)['properties']).not.toEqual((toConstrainedSchema(chatPrompt.schema, chatPrompt.constrainedProperties) as Json)['properties']);
  });

  it('should keep every constrained schema free of the regex escapes an Ollama grammar cannot compile, since it would drop the schema silently', () => {
    const patterns: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(collect);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'pattern') patterns.push(String(value));
        collect(value);
      }
    };
    for (const module of [...Object.values(PROMPT_REGISTRY), chatPrompt]) collect(toConstrainedSchema(module.schema, module.constrainedProperties));

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.filter(pattern => /\\[sSdDwWbB]/.test(pattern))).toEqual([]);
  });

  it('should name a schema whose prompt key carries a colon by the OpenAI naming rule', async () => {
    config('ai.structured-output', 'json-schema');
    const sent = wire(completion(JSON.stringify({ reply: 'x' })));
    const foundation = { ...chatPrompt, key: 'bible:foundation' as const };

    await router().service.structured(foundation, {}, CHAT_CTX, PINNED);

    expect((sent[0]?.body['response_format'] as { json_schema: { name: string } }).json_schema.name).toBe('bible_foundation');
  });

  it('should send a truncated constrained reply to the repair round rather than fail it as a transport error', async () => {
    config('ai.structured-output', 'json-schema');
    const sent = wire(completion('{"verdict": "consis', 'length'), completion(JUDGE_ANSWER));

    const output = await router().service.structured<JudgeOutput>(judgePrompt, {}, JUDGE_CTX, PINNED);

    const [first, repair] = sent.map(request => request.body['messages'] as { role: string; content: string }[]);
    expect(output.verdict).toBe('consistent');
    expect(sent).toHaveLength(2);
    expect(repair?.slice(-2).map(message => message.role)).toEqual(['assistant', 'user']);
    expect(repair?.at(-2)?.content).toBe('{"verdict": "consis');
    expect(repair).toHaveLength((first?.length ?? 0) + 2);
    expect(sent[1]?.body['response_format']).toEqual(sent[0]?.body['response_format']);
  });

  it('should stream the chat turn to the override with the constrained schema', async () => {
    config('ai.model-override', 'nf-e2e');
    config('ai.structured-output', 'json-schema');
    const sent = wire(streamed(CHAT_ANSWER));
    const deltas: string[] = [];

    const output = await router().service.streamStructured(chatPrompt, {}, CHAT_CTX, { onDelta: text => deltas.push(text) }, PINNED);

    expect(output.reply).toBe('Agreed.');
    expect(deltas.join('')).toBe('Agreed.');
    expect(sent[0]?.body).toMatchObject({ model: 'nf-e2e', stream: true, reasoning: { effort: 'none' }, response_format: { type: 'json_schema' } });
  });

  it('should constrain a tool-bound judge only when asked, and keep its non-strict tools off the SDK parse path', async () => {
    const tool = { type: 'function', function: { name: 'noop', description: 'Does nothing.', parameters: { type: 'object', properties: {} } } };
    const plain = wire(completion(JUDGE_ANSWER));
    await (await router().service.chatFor('judge', JUDGE_CTX, PINNED, undefined, PROMPT_REGISTRY.judge)).bindTools?.([tool]).invoke([new HumanMessage('Judge.')]);
    config('ai.structured-output', 'json-schema');
    const constrained = wire(completion(JUDGE_ANSWER));

    const answer = await (await router().service.chatFor('judge', JUDGE_CTX, PINNED, undefined, PROMPT_REGISTRY.judge)).bindTools?.([tool]).invoke([new HumanMessage('Judge.')]);

    expect(plain[0]?.body['response_format']).toBeUndefined();
    expect(answer?.content).toBe(JUDGE_ANSWER);
    expect(constrained[0]?.body['tools']).toHaveLength(1);
    expect((constrained[0]?.body['response_format'] as { json_schema: { name: string } }).json_schema.name).toBe('judge');
  });
});

describe('assertModelOverrideTarget', () => {
  it('should allow any target while no override is set', () => {
    expect(() => assertModelOverrideTarget(undefined, 'https://openrouter.ai/api/v1')).not.toThrow();
  });

  it('should allow an override pointed at a local model server', () => {
    expect(() => assertModelOverrideTarget('nf-e2e', 'http://host.docker.internal:11434/v1')).not.toThrow();
  });

  it('should refuse an override on the OpenRouter default, any OpenRouter host, an unset or an unparseable url', () => {
    for (const url of ['https://openrouter.ai/api/v1', 'https://eu.openrouter.ai/api/v1', undefined, 'not a url']) {
      let code: string | undefined;
      try {
        assertModelOverrideTarget('nf-e2e', url);
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code).toBe('AI_017');
    }
  });
});

describe('toConstrainedSchema', () => {
  const override = { items: { anyOf: [{ type: 'object', properties: { op: { enum: ['x'] } } }] } };

  it('should override the nested property its path addresses and leave the rest of the schema as hosted', () => {
    const hosted = toHostedPromptSchema(BibleContradictionSchema);
    const constrained = toConstrainedSchema(BibleContradictionSchema, { 'contradictions[].changeSet': override });
    const item = (schema: Json): Json => ((schema['properties'] as Json)['contradictions'] as Json)['items'] as Json;

    expect(((item(constrained)['properties'] as Json)['changeSet'] as Json)['items']).toEqual(override.items);
    expect({ ...(item(constrained)['properties'] as Json), changeSet: null }).toEqual({ ...(item(hosted)['properties'] as Json), changeSet: null });
  });

  it('should refuse a top-level path for a field that exists only nested, so a name match never reaches it by accident', () => {
    expect(() => toConstrainedSchema(BibleContradictionSchema, { changeSet: override })).toThrow();
    expect(() => toConstrainedSchema(BibleContradictionSchema, { 'contradictions[].missing': override })).toThrow();
  });
});
