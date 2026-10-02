import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { type ReplyStreamHandlers } from '@modules/ai/model-router.service';
import { ChatService } from '@modules/refinement/chat.service';
import { type ChatTurnEmitter } from '@modules/refinement/chat-turn-emitter';
import { traceArgs, TurnTraceCollector } from '@modules/refinement/chat-turn-trace';
import { serialiseMessage } from '@modules/refinement/serialise';

function clock(start = 0) {
  const time = { now: start };
  return { now: () => time.now, at: (ms: number) => (time.now = ms) };
}

function collector() {
  const time = clock();
  const trace = new TurnTraceCollector(time.now);
  const inner: string[] = [];
  const handlers = trace.observe({ onDelta: text => inner.push(`delta ${text}`), onChange: change => inner.push(`change ${change.index}`), onReset: () => inner.push('reset') });
  const change = { index: 0, element: { op: 'premise.update' } } as Parameters<NonNullable<ReplyStreamHandlers['onChange']>>[0];
  return { trace, handlers, change, inner, at: time.at };
}

describe('traceArgs', () => {
  it('should keep only the keys the label reads for each tool', () => {
    expect(traceArgs('get_notes', { from: 3, part: 2, query: 'the harbour', limit: 5, body: 'the notes themselves' })).toEqual({ from: 3, part: 2, query: 'the harbour' });
    expect(traceArgs('get_bible_document', { slug: 'magic-system', section: 'world', revision: 4 })).toEqual({ slug: 'magic-system', section: 'world' });
    expect(traceArgs('get_chapter_summaries', { from: 1, to: 4 })).toEqual({ from: 1, to: 4 });
    expect(traceArgs('get_canon_facts', { keys: ['mara-secret'] })).toEqual({});
  });

  it('should keep no arguments for a tool the labels do not know, including names that shadow object properties', () => {
    expect(traceArgs('invented_tool', { query: 'anything' })).toEqual({});
    expect(traceArgs('constructor', { query: 'anything' })).toEqual({});
  });

  it('should drop a value of the wrong primitive type, a blank string and a non-finite number', () => {
    expect(traceArgs('get_brief', { chapter: '3' })).toEqual({});
    expect(traceArgs('get_entity', { entityKey: 7 })).toEqual({});
    expect(traceArgs('search_lore', { query: { text: 'nested' } })).toEqual({});
    expect(traceArgs('get_world_facts', { category: '   ' })).toEqual({});
    expect(traceArgs('get_draft', { chapter: Number.POSITIVE_INFINITY })).toEqual({});
  });

  it('should trim text and cut a long query at 40 characters with an ellipsis', () => {
    const query = 'where the lighthouse keeper hid the ledger before the storm';

    expect(traceArgs('search_prose', { query: `  ${query}  ` })).toEqual({ query: `${query.slice(0, 40).trimEnd()}…` });
    expect(traceArgs('get_volume', { volumeKey: ` ${'v'.repeat(200)} ` }).volumeKey).toHaveLength(121);
  });
});

describe('TurnTraceCollector sources', () => {
  it('should list a lookup repeated across rounds once, with its latest status, in first-read order', () => {
    const { trace } = collector();

    trace.lookupStarted();
    trace.lookupSettled('get_notes', { query: 'harbour' }, 'error');
    trace.lookupStarted();
    trace.lookupSettled('get_entity', { entityKey: 'mara' }, 'ok');
    trace.lookupStarted();
    trace.lookupSettled('get_notes', { query: 'harbour', limit: 9 }, 'ok');

    expect(trace.finish().sources).toEqual([
      { tool: 'get_notes', args: { query: 'harbour' }, status: 'ok' },
      { tool: 'get_entity', args: { entityKey: 'mara' }, status: 'ok' },
    ]);
  });

  it('should never list a lookup that has not settled', () => {
    const { trace } = collector();

    trace.lookupStarted();

    expect(trace.finish().sources).toEqual([]);
  });

  it('should bound the sources a model can make the turn list', () => {
    const { trace } = collector();

    for (let index = 0; index < 100; index++) trace.lookupSettled(`invented_${index}`, {}, 'error');
    trace.lookupSettled('invented_0', {}, 'ok');

    const { sources } = trace.finish();
    expect(sources).toHaveLength(64);
    expect(sources[0]).toEqual({ tool: 'invented_0', args: {}, status: 'ok' });
  });
});

describe('TurnTraceCollector timing', () => {
  it('should count waiting as thinking and leave the write steps out when nothing streamed', () => {
    const { trace, at } = collector();

    at(2000);

    expect(trace.finish().timing).toEqual({ readMs: 0, thinkMs: 2000, workedMs: 2000 });
  });

  it('should pause thinking for a lookup and drop the wait before it, as the live view does', () => {
    const { trace, handlers, change, at } = collector();

    at(200);
    trace.lookupStarted();
    at(500);
    trace.lookupSettled('get_notes', {}, 'ok');
    at(1500);
    handlers.onDelta('Here');
    at(2000);
    handlers.onDelta(' it is.');
    at(3000);
    handlers.onChange?.(change);
    at(4000);

    expect(trace.finish().timing).toEqual({ readMs: 500, thinkMs: 1000, writeMs: 1500, saveMs: 1000, workedMs: 4000 });
  });

  it('should forget when a replaced reply began, and keep counting the wait for its replacement as thinking', () => {
    const { trace, handlers, at, inner } = collector();

    at(1000);
    handlers.onDelta('First try.');
    at(1500);
    handlers.onReset?.();
    at(2500);
    handlers.onDelta('Second try.');
    at(3000);

    expect(trace.finish().timing).toEqual({ readMs: 500, thinkMs: 2000, writeMs: 500, workedMs: 3000 });
    expect(inner).toEqual(['delta First try.', 'reset', 'delta Second try.']);
  });

  it('should void the superseded reply only once its replacement writes', () => {
    const { trace, handlers, at } = collector();

    at(1000);
    handlers.onDelta('Let me check your notes.');
    at(1200);
    trace.lookupStarted();
    at(1500);
    trace.lookupSettled('get_notes', {}, 'ok');
    trace.supersedeOnNextWrite();
    at(2000);
    handlers.onDelta('Your notes say…');
    at(2500);

    expect(trace.finish().timing).toEqual({ readMs: 500, thinkMs: 1500, writeMs: 500, workedMs: 2500 });
  });

  it('should keep the reply when a supersede is followed by no write at all', () => {
    const { trace, handlers, at } = collector();

    at(1000);
    handlers.onDelta('Final answer.');
    trace.supersedeOnNextWrite();
    at(3000);

    expect(trace.finish().timing).toEqual({ readMs: 0, thinkMs: 1000, writeMs: 2000, workedMs: 3000 });
  });
});

const SESSION = {
  id: 'session-1',
  projectId: 1n,
  status: 'active',
  scopeType: 'project',
  scopeRef: null,
  mode: 'manual',
  contentMode: 'standard',
  costTier: null,
  createdAt: new Date(0),
};

const NOTES_BODY = 'Mara hides the ledger under the lighthouse stairs.';

const getNotes = {
  name: 'get_notes',
  description: 'Reads the notes.',
  inputSchema: z.object({ query: z.string().optional(), limit: z.number().optional() }),
  handler: async () => NOTES_BODY,
  tokensBudget: 0,
  maxCallsPerRun: 4,
};

interface Turn {
  outputs: unknown[];
  failTraceUpdate?: boolean;
}

function chat({ outputs, failTraceUpdate = false }: Turn) {
  const updates: Record<string, unknown>[] = [];
  const pending = [...outputs];
  const db = {
    query: {
      chatSessions: { findFirst: async () => SESSION },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => Object.assign(Promise.resolve(), { returning: async () => [{ id: 7n, ...values }] }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (failTraceUpdate && 'trace' in values) throw new Error('connection reset');
          updates.push(values);
        },
      }),
    }),
    select: () => ({ from: () => ({ where: async () => [{ max: 0 }] }) }),
  };
  const modelRouter = {
    routeModel: () => ({ resolved: { provider: 'p', model: 'm' }, source: 'tier', costTier: 'balanced', contentMode: 'standard' }),
    structured: async () => pending.shift(),
    streamStructured: async (_prompt: unknown, _input: unknown, _ctx: unknown, handlers: ReplyStreamHandlers) => {
      handlers.onDelta('Streamed.');
      return pending.shift();
    },
  };
  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
      runId: 'run-1',
      result: await fn('run-1'),
    }),
    linkContextPack: async () => undefined,
    setParentRun: async () => undefined,
  };
  const service = new ChatService(
    { getPostgresClient: () => db } as never,
    { forNovelChat: async () => ({ id: null, renderedStable: '', renderedVolatile: '' }) } as never,
    modelRouter as never,
    workflowRunService as never,
    {} as never,
    {} as never,
    { getRaw: () => [getNotes] } as never,
    {} as never,
    { compactIfNeeded: async () => undefined, buildHistory: async () => [] } as never,
    { resolve: async () => ({ writerClass: 'standard', raised: false, systemMessages: [] }) } as never,
    { publish: () => undefined } as never,
    { read: async () => ({ text: '' }) } as never,
  );
  return { service, updates };
}

const emitter: ChatTurnEmitter = {
  onRunId: () => undefined,
  onUserMessage: () => undefined,
  onLookup: () => undefined,
  onDelta: () => undefined,
  onChange: () => undefined,
  onReset: () => undefined,
};

const LOOKUP_TURN = [{ reply: 'Checking.', lookups: [{ tool: 'get_notes', args: { query: 'ledger', limit: 3 } }] }, { reply: 'The ledger is under the stairs.' }];

describe('ChatService.turn — trace', () => {
  it('should save what the turn read on the reply, without the lookup result or the arguments the label never reads', async () => {
    const run = chat({ outputs: LOOKUP_TURN });

    const result = await run.service.turn(1n, 'session-1', 'Where is the ledger?');

    const saved = run.updates.find(values => 'trace' in values)?.['trace'];
    expect(saved).toMatchObject({ sources: [{ tool: 'get_notes', args: { query: 'ledger' }, status: 'ok' }] });
    expect(result.assistantMessage.trace).toBe(saved as never);
    expect(JSON.stringify(saved)).not.toContain(NOTES_BODY);
    expect(JSON.stringify(saved)).not.toContain('limit');
  });

  it('should leave the write steps out on the synchronous route, which never sees the reply being written', async () => {
    const run = chat({ outputs: LOOKUP_TURN });

    const result = await run.service.turn(1n, 'session-1', 'Where is the ledger?');

    expect(Object.keys(result.assistantMessage.trace?.timing ?? {}).sort()).toEqual(['readMs', 'thinkMs', 'workedMs']);
  });

  it('should time the reply being written on the streamed route', async () => {
    const run = chat({ outputs: LOOKUP_TURN });

    const result = await run.service.turn(1n, 'session-1', 'Where is the ledger?', emitter);

    expect(result.assistantMessage.trace?.timing.writeMs).toBeNumber();
    expect(result.assistantMessage.trace?.timing.saveMs).toBeUndefined();
  });

  it('should settle the turn with no trace when saving the trace fails', async () => {
    const run = chat({ outputs: LOOKUP_TURN, failTraceUpdate: true });

    const result = await run.service.turn(1n, 'session-1', 'Where is the ledger?');

    expect(result.assistantMessage.content).toBe('The ledger is under the stairs.');
    expect(result.assistantMessage.trace ?? null).toBeNull();
    expect(run.updates.some(values => 'lastTurnAt' in values)).toBe(true);
  });
});

describe('serialiseMessage — trace', () => {
  const message = { id: 1n, sessionId: 'session-1', ordinal: 2, role: 'assistant', content: 'Done.', createdAt: new Date(0) };

  it('should carry the trace of a settled reply', () => {
    const trace = { sources: [{ tool: 'get_entity', args: { entityKey: 'mara' }, status: 'ok' as const }], timing: { readMs: 1, thinkMs: 2, workedMs: 3 } };

    expect(serialiseMessage({ ...message, trace }).trace).toEqual(trace);
  });

  it('should answer null for a reply older than the trace', () => {
    expect(serialiseMessage(message).trace).toBeNull();
  });
});
