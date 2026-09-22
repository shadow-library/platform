import { describe, expect, it, jest } from 'bun:test';

import { ModelRouterService, type ReplyStreamHandlers } from '@modules/ai/model-router.service';
import { type ChatRefineOutput, ChatRefineSchema } from '@modules/ai/schemas/chat-refine.schema';

type StreamEvent = { type: 'delta'; text: string } | { type: 'reset' };

interface StreamScript {
  chunks: string[];
  fail?: boolean;
}

const CTX = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
const CHAT_CTX = { projectId: BigInt(1), promptKey: 'chat-refine', promptVersion: '1.0.0', role: 'chat' };

const emptyTemplate = { formatMessages: async () => [] } as never;

// `chat` is the only role that will ever pass a stream, but it is not in CACHEABLE_ROLES — so the cache
// path needs a cacheable role, and the two fixtures differ in nothing else. Neither template contributes
// messages of its own, leaving the fake client fully in charge of the ladder.
const chatPrompt = {
  key: 'chat-refine' as const,
  version: '2.0.0',
  kind: 'analytical' as const,
  role: 'chat' as const,
  system: 'test',
  template: emptyTemplate,
  schema: ChatRefineSchema,
};
const cacheablePrompt = { key: 'judge' as const, version: '1.0.0', kind: 'analytical' as const, system: 'test', template: emptyTemplate, schema: ChatRefineSchema };

function stubDb(cachedResponse?: string): unknown {
  const cached = cachedResponse === undefined ? undefined : { response: cachedResponse };
  return {
    query: { llmCache: { findFirst: async () => cached } },
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
  };
}

function fakeClient(streams: StreamScript[], invokeResponses: string[] = []) {
  let streamCalls = 0;
  let invokeCalls = 0;
  return {
    get streamCalls() {
      return streamCalls;
    },
    get invokeCalls() {
      return invokeCalls;
    },
    stream: async () => {
      const script = streams[streamCalls++] ?? { chunks: [] };
      return (async function* () {
        for (const chunk of script.chunks) yield { content: chunk };
        if (script.fail) throw new Error('transport boom');
      })();
    },
    invoke: async () => ({ content: invokeResponses[invokeCalls++] ?? '' }),
  };
}

function makeRouter(client: unknown, cachedResponse?: string) {
  const warns: { message: string; meta: Record<string, unknown> }[] = [];
  const router = new ModelRouterService(
    {} as never,
    { getPostgresClient: () => stubDb(cachedResponse) } as never,
    { enforce: async () => undefined } as never,
    { defaultsFor: async () => undefined } as never,
  );
  (router as unknown as Record<string, unknown>)['buildClient'] = () => client;
  (router as unknown as Record<string, unknown>)['llmBackoffMs'] = 0;
  (router as unknown as Record<string, unknown>)['logger'] = {
    debug: () => undefined,
    error: () => undefined,
    warn: (message: string, meta: Record<string, unknown> = {}) => warns.push({ message, meta }),
  };
  return { router, warns };
}

function recorder(): { handlers: ReplyStreamHandlers; events: StreamEvent[] } {
  const events: StreamEvent[] = [];
  return {
    events,
    handlers: { onDelta: text => events.push({ type: 'delta', text }), onReset: () => events.push({ type: 'reset' }) },
  };
}

const deltaText = (events: StreamEvent[]): string =>
  events
    .filter(event => event.type === 'delta')
    .map(event => event.text)
    .join('');

const tick = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const settle = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

async function runClockUntil(isDone: () => boolean): Promise<void> {
  for (let step = 0; step < 100; step++) {
    await settle();
    if (isDone()) return;
    if (jest.getTimerCount() === 0) throw new Error('clock stalled before the scenario finished');
    jest.advanceTimersToNextTimer();
  }
  throw new Error('clock never settled');
}

const split = (text: string, size: number): string[] => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [];

describe('ModelRouterService.streamStructured', () => {
  it('should emit the reply in order and return the same value structured would', async () => {
    const payload = JSON.stringify({ reply: 'Hello, world — the tide is out.', changeSet: [] });
    const { router } = makeRouter(fakeClient([{ chunks: split(payload, 7) }], [payload]));
    const { handlers, events } = recorder();

    const streamed = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    const invoked = await router.structured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX);

    expect(events.filter(event => event.type === 'delta').length).toBeGreaterThan(1);
    expect(deltaText(events)).toBe('Hello, world — the tide is out.');
    expect(events.some(event => event.type === 'reset')).toBe(false);
    expect(streamed).toEqual(invoked);
    expect(streamed.reply).toBe('Hello, world — the tide is out.');
  });

  it('should emit deltas even when the model emits changeSet before reply', async () => {
    const payload = JSON.stringify({ changeSet: [{ op: 'brief.update', chapter: 3 }], reply: 'Late but present.' });
    const { router, warns } = makeRouter(fakeClient([{ chunks: split(payload, 5) }]));
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    expect(deltaText(events)).toBe('Late but present.');
    expect(result.reply).toBe('Late but present.');
    expect(warns).toHaveLength(0);
  });

  it('should emit the cached reply as exactly one delta and never call the model', async () => {
    const client = fakeClient([]);
    const { router } = makeRouter(client, JSON.stringify({ reply: 'Served from cache.', changeSet: [] }));
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(cacheablePrompt, {}, CTX, handlers);
    expect(events).toEqual([{ type: 'delta', text: 'Served from cache.' }]);
    expect(result.reply).toBe('Served from cache.');
    expect(client.streamCalls).toBe(0);
    expect(client.invokeCalls).toBe(0);
  });

  it('should warn with provider, model and prompt key when the response carries no reply, and still return', async () => {
    const noReply = JSON.stringify({ changeSet: [{ op: 'brief.update' }] });
    const repaired = JSON.stringify({ reply: 'Recovered.', changeSet: [] });
    const { router, warns } = makeRouter(fakeClient([{ chunks: split(noReply, 9) }], [repaired]));
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    expect(result.reply).toBe('Recovered.');
    expect(events).toEqual([]);

    const defeated = warns.find(warn => warn.message.includes('defeated the reply stream'));
    expect(defeated).toBeDefined();
    expect(defeated?.meta['provider']).toBeString();
    expect(defeated?.meta['model']).toBeString();
    expect(defeated?.meta['promptKey']).toBe('chat-refine');
    expect(defeated?.meta['role']).toBe('chat');
  });

  it('should reset when the repair ladder returns a different reply', async () => {
    const broken = '{"reply":"Draft answer.","changeSet":"not-an-array"}';
    const repaired = JSON.stringify({ reply: 'Authoritative answer.', changeSet: [] });
    const { router } = makeRouter(fakeClient([{ chunks: split(broken, 6) }], [repaired]));
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    expect(deltaText(events)).toBe('Draft answer.');
    expect(events.at(-1)).toEqual({ type: 'reset' });
    expect(result.reply).toBe('Authoritative answer.');
  });

  it('should not reset when the repair ladder reproduces the streamed reply verbatim', async () => {
    const broken = '{"reply":"Draft answer.","changeSet":"not-an-array"}';
    const repaired = JSON.stringify({ reply: 'Draft answer.', changeSet: [] });
    const { router } = makeRouter(fakeClient([{ chunks: split(broken, 6) }], [repaired]));
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    expect(deltaText(events)).toBe('Draft answer.');
    expect(events.some(event => event.type === 'reset')).toBe(false);
    expect(result.reply).toBe('Draft answer.');
  });

  it('should reset once and restart the reply when a transport retry follows a partial stream', async () => {
    const payload = JSON.stringify({ reply: 'Second attempt wins.', changeSet: [] });
    const client = fakeClient([{ chunks: ['{"reply":"First att'], fail: true }, { chunks: split(payload, 8) }]);
    const { router } = makeRouter(client);
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    const resetAt = events.findIndex(event => event.type === 'reset');

    expect(client.streamCalls).toBe(2);
    expect(resetAt).toBeGreaterThan(-1);
    expect(deltaText(events.slice(0, resetAt))).toBe('First att');
    expect(deltaText(events.slice(resetAt))).toBe('Second attempt wins.');
    expect(events.filter(event => event.type === 'reset')).toHaveLength(1);
    expect(result.reply).toBe('Second attempt wins.');
  });

  it('should finish the turn when the delta sink throws', async () => {
    const payload = JSON.stringify({ reply: 'Sink is gone.', changeSet: [] });
    const { router } = makeRouter(fakeClient([{ chunks: split(payload, 4) }]));

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, {
      onDelta: () => {
        throw new Error('connection closed');
      },
    });
    expect(result.reply).toBe('Sink is gone.');
  });

  it('should stop feeding the relay when an attempt is abandoned, not when its backoff ends', async () => {
    const payload = JSON.stringify({ reply: 'SECOND.', changeSet: [] });
    const yielded: string[] = [];
    let lateChunkYielded = false;
    let streamCalls = 0;
    const client = {
      invoke: async () => ({ content: payload }),
      stream: async () => {
        const stalling = streamCalls++ === 0;
        return (async function* () {
          if (!stalling) {
            yield { content: payload };
            return;
          }
          // Keeps producing long after `withTimeout` has rejected — the case a clean transport throw
          // cannot model, and the only one that catches a guard taken after the backoff sleep.
          for (const [chunk, delay] of [
            ['{"reply":"A', 5],
            ['B', 5],
            ['LATE', 400],
          ] as const) {
            // `LATE` is timed to land inside the backoff window, which is the only interval where a
            // zombie chunk can reach the author: once the retry calls `restart()` the fresh scanner
            // swallows it, so a later arrival would pass whether or not the guard exists.
            await tick(delay);
            yielded.push(chunk);
            // Before the yield: breaking the consumer's `for await` returns into the generator, so nothing
            // after the yield ever runs.
            if (chunk === 'LATE') lateChunkYielded = true;
            yield { content: chunk };
          }
        })();
      },
    };
    const { router } = makeRouter(client);
    (router as unknown as Record<string, unknown>)['llmTimeoutMs'] = 300;
    (router as unknown as Record<string, unknown>)['llmBackoffMs'] = 800;
    const { handlers, events } = recorder();
    let result: ChatRefineOutput | undefined;

    jest.useFakeTimers();
    try {
      let settled = false;
      const run = router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers).finally(() => (settled = true));
      // The abandoned generator is still mid-sleep when the retry lands, so the clock runs until both the retry
      // has settled and the zombie chunk has been produced — an unguarded delivery would land in between.
      await runClockUntil(() => settled && lateChunkYielded);
      result = await run;
    } finally {
      jest.useRealTimers();
    }
    const texts = events.filter(event => event.type === 'delta').map(event => event.text);

    expect(yielded).toContain('LATE');
    expect(texts).not.toContain('LATE');
    expect(
      deltaText(
        events.slice(
          0,
          events.findIndex(event => event.type === 'reset'),
        ),
      ),
    ).toBe('AB');
    expect(result?.reply).toBe('SECOND.');
  });

  it('should treat a chunk whose content is neither a string nor a parts array as empty', async () => {
    const payload = JSON.stringify({ reply: 'Survived the empty chunk.', changeSet: [] });
    let streamCalls = 0;
    const client = {
      invoke: async () => ({ content: payload }),
      stream: async () => {
        streamCalls++;
        return (async function* () {
          yield { content: null };
          yield { content: payload };
        })();
      },
    };
    const { router } = makeRouter(client);
    const { handlers, events } = recorder();

    const result = await router.streamStructured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX, handlers);
    expect(result.reply).toBe('Survived the empty chunk.');
    expect(deltaText(events)).toBe('Survived the empty chunk.');
    expect(streamCalls).toBe(1);
  });

  it('should leave `structured` on the invoke path, never calling stream', async () => {
    const payload = JSON.stringify({ reply: 'Plain call.', changeSet: [] });
    const client = fakeClient([{ chunks: [payload] }], [payload]);
    const { router } = makeRouter(client);

    const result = await router.structured<ChatRefineOutput>(chatPrompt, {}, CHAT_CTX);
    expect(result.reply).toBe('Plain call.');
    expect(client.streamCalls).toBe(0);
    expect(client.invokeCalls).toBe(1);
  });
});
