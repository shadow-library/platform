import { describe, expect, it } from 'bun:test';

import { JSON_SCHEMA_INSTRUCTION } from '@modules/providers/chat-translation.util';
import { createMockFetch, minimalForSchema, mockAnswer, mockDelayMs } from '@modules/providers/mock.provider';

import { MOCK, modelSpec, targetFor } from './provider-fixtures';

describe('mockDelayMs', () => {
  it('should read the delay from a deployment id suffix', () => {
    expect(mockDelayMs('echo?delay-ms=250')).toBe(250);
  });

  it('should answer no delay without a valid suffix', () => {
    for (const id of ['echo', 'echo?delay-ms=soon', 'echo?delay-ms=-5', 'echo?other=1']) expect(mockDelayMs(id)).toBe(0);
  });
});

describe('minimalForSchema', () => {
  it('should build only the required properties, recursively', () => {
    const schema = {
      type: 'object',
      required: ['title', 'meta', 'tags'],
      properties: {
        title: { type: 'string' },
        optional: { type: 'string' },
        meta: { type: 'object', required: ['count', 'done'], properties: { count: { type: 'integer' }, done: { type: 'boolean' } } },
        tags: { type: 'array', items: { type: 'string' } },
      },
    };

    expect(minimalForSchema(schema)).toEqual({ title: '', meta: { count: 0, done: false }, tags: [] });
  });

  it('should honour enum, const, minimums, nullable unions, anyOf and minItems', () => {
    const schema = {
      type: 'object',
      required: ['kind', 'version', 'size', 'code', 'note', 'pick', 'pair'],
      properties: {
        kind: { enum: ['b', 'a'] },
        version: { const: 2 },
        size: { type: 'number', minimum: 3 },
        code: { type: 'string', minLength: 2 },
        note: { type: ['null', 'string'] },
        pick: { anyOf: [{ type: 'boolean' }, { type: 'string' }] },
        pair: { type: 'array', minItems: 2, items: { type: 'integer' } },
      },
    };

    expect(minimalForSchema(schema)).toEqual({ kind: 'b', version: 2, size: 3, code: 'xx', note: '', pick: false, pair: [0, 0] });
  });

  it('should clamp lengths and counts to small non-negative integers', () => {
    const schema = {
      type: 'object',
      required: ['huge', 'negative', 'fraction', 'many'],
      properties: {
        huge: { type: 'string', minLength: 1e12 },
        negative: { type: 'array', minItems: -3, items: { type: 'string' } },
        fraction: { type: 'string', minLength: 2.5 },
        many: { type: 'array', minItems: 1e9, items: { type: 'integer' } },
      },
    };

    const value = minimalForSchema(schema) as { huge: string; negative: unknown[]; fraction: string; many: unknown[] };

    expect(value.huge).toHaveLength(64);
    expect(value.negative).toEqual([]);
    expect(value.fraction).toBe('');
    expect(value.many).toHaveLength(64);
  });

  it('should build tuple-form items, padding to minItems', () => {
    const schema = {
      type: 'object',
      required: ['legacy', 'modern'],
      properties: {
        legacy: { type: 'array', items: [{ type: 'string' }, { type: 'boolean' }] },
        modern: { type: 'array', prefixItems: [{ type: 'integer' }], items: { const: 'rest' }, minItems: 3 },
      },
    };

    expect(minimalForSchema(schema)).toEqual({ legacy: ['', false], modern: [0, 'rest', 'rest'] });
  });

  it('should stay bounded for a schema that would expand exponentially', () => {
    const level = (inner: object): object => ({ type: 'array', minItems: 64, items: inner });
    const schema = level(level(level(level(level({ type: 'string' })))));

    expect(() => JSON.stringify(minimalForSchema(schema as never))).not.toThrow();
    expect(JSON.stringify(minimalForSchema(schema as never)).length).toBeLessThan(100_000);
  });

  it('should resolve local references and stop at a recursive one', () => {
    const schema = {
      $defs: { node: { type: 'object', required: ['child'], properties: { child: { $ref: '#/$defs/node' } } } },
      type: 'object',
      required: ['root'],
      properties: { root: { $ref: '#/$defs/node' } },
    };

    expect(JSON.stringify(minimalForSchema(schema))).toContain('"child":null');
  });
});

describe('mockAnswer', () => {
  const schema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

  it('should answer {"ok":true} without a schema', () => {
    expect(mockAnswer({ messages: [{ role: 'user', content: 'hi' }] })).toBe('{"ok":true}');
  });

  it('should answer the minimal object of a native json_schema response format', () => {
    expect(mockAnswer({ response_format: { type: 'json_schema', json_schema: { schema } } })).toBe('{"ok":false}');
  });

  it('should answer the minimal object of a schema injected into the prompt', () => {
    expect(
      mockAnswer({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'system', content: `${JSON_SCHEMA_INSTRUCTION}${JSON.stringify(schema)}` },
        ],
      }),
    ).toBe('{"ok":false}');
  });
});

describe('createMockFetch', () => {
  const init = (body: object, signal?: AbortSignal): RequestInit => ({ method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) });

  it('should answer a chat completion with the canned usage', async () => {
    const response = await createMockFetch(targetFor('mock', MOCK, 'echo'))('mock://local/chat/completions', init({ model: 'echo', messages: [] }));

    expect(await response.json()).toMatchObject({
      model: 'echo',
      choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  it('should stream the answer in three chunks, then a usage frame and [DONE]', async () => {
    const response = await createMockFetch(targetFor('mock', MOCK, 'echo'))('mock://local/chat/completions', init({ model: 'echo', stream: true }));
    const frames = (await response.text()).split('\n\n').filter(Boolean);

    expect(frames).toHaveLength(5);
    expect(frames.at(-1)).toBe('data: [DONE]');
    const parsed = frames.slice(0, 4).map(frame => JSON.parse(frame.slice('data: '.length)));
    expect(
      parsed
        .slice(0, 3)
        .map(frame => frame.choices[0].delta.content)
        .join(''),
    ).toBe('{"ok":true}');
    expect(parsed[3]).toMatchObject({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  });

  it("should answer embeddings deterministically at the model's dimensions", async () => {
    const target = targetFor('mock', MOCK, 'embed', modelSpec({ embedding: { dimensions: 4 } }));
    const embed = async (): Promise<number[][]> => {
      const response = await createMockFetch(target)('mock://local/embeddings', init({ model: 'embed', input: ['a', 'b'] }));
      return ((await response.json()) as { data: { embedding: number[] }[] }).data.map(item => item.embedding);
    };

    const [first, second] = await Promise.all([embed(), embed()]);

    expect(first).toEqual(second as number[][]);
    expect(first?.map(vector => vector.length)).toEqual([4, 4]);
    expect(first?.[0]).not.toEqual(first?.[1] as number[]);
  });

  it('should answer n images', async () => {
    const response = await createMockFetch(targetFor('mock', MOCK, 'image'))('mock://local/images', init({ model: 'image', prompt: 'p', n: 2 }));

    expect(((await response.json()) as { data: unknown[] }).data).toHaveLength(2);
  });

  it('should reject like fetch when aborted during its delay', async () => {
    const controller = new AbortController();
    const pending = createMockFetch(targetFor('mock', MOCK, 'echo?delay-ms=1000'))('mock://local/chat/completions', init({ model: 'echo' }, controller.signal));

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
