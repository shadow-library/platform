import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';
import { Config } from '@shadow-library/common';
import { z } from 'zod';

import { schema } from '@server/database';

import { type ContextSection, joinSections } from '@modules/ai/context/sections';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { ChatLookupService } from '@modules/refinement/chat-lookup.service';
import { ChatSessionService } from '@modules/refinement/chat-session.service';
import { ChatTurnStagingService } from '@modules/refinement/chat-turn-staging.service';
import { ChatService } from '@modules/refinement/chat.service';

import { FakeSynapse } from '../ai/synapse-fakes';

const cache = (Config as unknown as { cache: Map<string, unknown> })['cache'];
const CONFIG = { 'app.stage': 'dev' };
const saved = new Map(Object.keys(CONFIG).map(key => [key, cache.get(key)]));

beforeAll(() => Object.entries(CONFIG).forEach(([key, value]) => cache.set(key, value)));
afterAll(() => saved.forEach((value, key) => cache.set(key, value)));

interface Call {
  role?: string;
  session?: string;
  webTools?: boolean;
  route?: unknown;
  messages: BaseMessage[];
}

interface ClientOptions {
  session?: string;
  webTools?: boolean;
}

interface HarnessOptions {
  webMode?: string;
  served?: { provider: string; model: string };
  unrestrictedAvailable?: boolean;
}

interface Wire {
  system: string;
  turns: { role: string; text: string }[];
}

function text(content: unknown): string {
  if (typeof content === 'string') return content;
  return (content as { type: string; text?: string }[]).flatMap(part => (part.type === 'text' && part.text ? [part.text] : [])).join('\n');
}

// What the gateway reads off a request: the system messages joined, and every other message in order.
function wire(messages: BaseMessage[]): Wire {
  const system = messages.filter(message => message.getType() === 'system').map(message => text(message.content));
  const turns = messages.filter(message => message.getType() !== 'system').map(message => ({ role: message.getType(), text: text(message.content) }));
  return { system: system.join('\n\n'), turns };
}

// The gateway's own test: the request repeats what the session holds — every non-assistant message unchanged, every assistant message in
// its place, ending on the reply the last call produced — and adds at least one new non-assistant message.
function resumes(held: Wire, next: Wire): boolean {
  const digest = (turn: { role: string; text: string }) => (turn.role === 'ai' ? 'ai' : `${turn.role}:${turn.text}`);
  const prefix = [...held.turns.map(digest), 'ai'];
  const rest = next.turns.slice(prefix.length);
  return (
    held.system === next.system &&
    next.turns.length > prefix.length &&
    prefix.every((entry, index) => entry === digest(next.turns[index] as Wire['turns'][number])) &&
    rest.every(turn => turn.role !== 'ai')
  );
}

function section(key: string, segment: 'stable' | 'volatile', body: string): ContextSection {
  return { key, segment, tier: 'canonical', tokens: 10, truncated: false, sourceRefs: [], rendered: `## ${key.toUpperCase()}\n\n${body}` };
}

const NOTES = 'Mara hides the ledger under the lighthouse stairs.';

function harness(outputs: Record<string, unknown[]>, { webMode = 'off', served, unrestrictedAvailable = true }: HarnessOptions = {}) {
  const session = {
    id: 'session-1',
    projectId: 1n,
    status: 'active',
    scopeType: 'project',
    scopeRef: null,
    mode: 'manual',
    contentMode: null,
    costTier: null,
    modelProvider: null,
    modelId: null,
    aliasKey: null as string | null,
    title: null,
    summary: null as string | null,
    summaryThroughOrdinal: 0,
    createdAt: new Date(0),
  };
  const rows: Record<string, unknown>[] = [];
  const sessionSets: Record<string, unknown>[] = [];
  const stable = { story: 'Mara keeps the lighthouse.', inventory: 'mara (character)' };
  const db = {
    query: {
      chatSessions: { findFirst: async () => session },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard', costTier: 'balanced' }) },
      chatMessages: { findMany: async () => rows.filter(row => (row['ordinal'] as number) > session.summaryThroughOrdinal) },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const row = { id: BigInt(rows.length + 1), contexts: null, question: null, exchange: null, ...values };
        if (table === schema.chatMessages) rows.push(row);
        return Object.assign(Promise.resolve(), { returning: async () => [row] });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === schema.chatSessions) sessionSets.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [] }) };
      },
    }),
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve('max' in columns ? [{ max: rows.length }] : []), {
            orderBy: () => ({ limit: async () => [] }),
          }),
      }),
    }),
  };
  const databaseService = { getPostgresClient: () => db } as never;
  const workflowRunService = {
    runChain: async (_projectId: bigint, graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => {
      const runId = `${graph}-${rows.length}`;
      return { runId, result: await fn(runId) };
    },
    linkContextPack: async () => undefined,
    setParentRun: async () => undefined,
  };
  const calls: Call[] = [];
  const modelRouter = new ModelRouterService({} as never, databaseService, new FakeSynapse().client);
  const client = (role: string | undefined, route: unknown, opts: ClientOptions) => ({
    invoke: async (messages: BaseMessage[]) => {
      calls.push({ role, session: opts.session, webTools: opts.webTools, route, messages });
      return { content: JSON.stringify(outputs[role ?? '']?.shift()), response_metadata: served ? { synapse: { ...served, task: `novel-forge.${role}` } } : {} };
    },
  });
  (modelRouter as unknown as Record<string, unknown>)['buildSynapseClient'] = (role: string, route: unknown, opts: ClientOptions) => client(role, route, opts);
  const pluginPolicy = { resolve: async () => ({ writerClass: 'standard', raised: false, plugins: [], systemMessages: [] }) };
  const compaction = new ChatCompactionService(databaseService, modelRouter, workflowRunService as never, pluginPolicy as never);
  const contextAssembler = {
    forNovelChat: async () => {
      const sections = [section('story', 'stable', stable.story), section('inventory', 'stable', stable.inventory), section('handoff', 'volatile', 'Chapter 1 is next.')];
      return {
        id: null,
        sections,
        omitted: [],
        renderedStable: joinSections(sections.filter(s => s.segment === 'stable')),
        renderedVolatile: joinSections(sections.filter(s => s.segment === 'volatile')),
      };
    },
  };
  const getNotes = {
    name: 'get_notes',
    description: 'Reads the notes.',
    inputSchema: z.object({ query: z.string().optional() }),
    handler: async () => NOTES,
    tokensBudget: 0,
    maxCallsPerRun: 4,
  };
  const service = new ChatService(
    databaseService,
    contextAssembler as never,
    modelRouter,
    workflowRunService as never,
    compaction,
    pluginPolicy as never,
    { publish: () => undefined } as never,
    { read: async () => ({ text: '' }) } as never,
    { modeFor: async () => webMode } as never,
    new ChatSessionService(databaseService, modelRouter, workflowRunService as never, { publish: () => undefined } as never),
    new ChatLookupService(databaseService, { getRaw: () => [getNotes] } as never, {} as never),
    new ChatTurnStagingService(databaseService, {} as never, {} as never, {} as never),
    { unrestrictedAvailable: async () => unrestrictedAvailable } as never,
  );
  const chatCalls = () => calls.filter(call => call.role === 'chat');
  return { service, session, stable, calls, chatCalls, rows, sessionSets };
}

// The negation check reads canon off the database; here the first reply is flagged and every later one passes.
function warnOnce(service: ChatService): void {
  let checks = 0;
  (service as unknown as Record<string, unknown>)['negationWarnings'] = async () => (checks++ === 0 ? ['"no longer has the ledger" states an absence'] : []);
}

const LOOKUP = { reply: 'Checking your notes.', lookups: [{ tool: 'get_notes', args: { query: 'ledger' } }] };

describe('ChatService.turn — gateway session', () => {
  it('should open turn 2 with exactly what turn 1’s last call sent and its reply, so the gateway resumes the session', async () => {
    const run = harness({ chat: [LOOKUP, { reply: 'Under the stairs.' }, { reply: 'She moves it at dawn.' }], title: [{ title: 'The ledger' }] });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');
    await run.service.turn(1n, 'session-1', 'And when does she move it?');

    const [first, last, next] = run.chatCalls();
    expect(run.chatCalls()).toHaveLength(3);
    expect(wire((last as Call).messages).turns.at(-1)?.text).toContain(NOTES);
    expect(resumes(wire((first as Call).messages), wire((last as Call).messages))).toBe(true);
    expect(resumes(wire((last as Call).messages), wire((next as Call).messages))).toBe(true);
    expect(wire((next as Call).messages).system).toBe(wire((first as Call).messages).system);
    expect(wire((next as Call).messages).turns.at(-1)?.text).toContain('Unchanged since the previous turn.');
  });

  it('should carry a repaired reply’s re-ask into the next turn, as the session holds it', async () => {
    const run = harness({ chat: [{ answer: 'not the shape' }, { reply: 'Under the stairs.' }, { reply: 'At dawn.' }], title: [{ title: 'The ledger' }] });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');
    await run.service.turn(1n, 'session-1', 'When does she move it?');

    const [, repair, next] = run.chatCalls();
    expect(wire((repair as Call).messages).turns.at(-1)?.text).toStartWith('That response could not be used.');
    expect(resumes(wire((repair as Call).messages), wire((next as Call).messages))).toBe(true);
  });

  it('should continue the next turn from the negation fix the turn kept', async () => {
    const run = harness({
      chat: [{ reply: 'Mara no longer has the ledger.' }, { reply: 'Mara gave the ledger away.' }, { reply: 'To her brother.' }],
      title: [{ title: 'The ledger' }],
    });
    warnOnce(run.service);

    await run.service.turn(1n, 'session-1', 'Take the ledger away from Mara.');
    await run.service.turn(1n, 'session-1', 'Who has it now?');

    const [, fix, next] = run.chatCalls();
    expect(wire((fix as Call).messages).turns.at(-1)?.text).toStartWith('Your changeSet removes things by stating their absence');
    expect(resumes(wire((fix as Call).messages), wire((next as Call).messages))).toBe(true);
  });

  it('should continue from the reply it kept when the negation fix asked for lookups instead, leaving the gateway to start over', async () => {
    const run = harness({ chat: [{ reply: 'Mara no longer has the ledger.' }, LOOKUP, { reply: 'To her brother.' }], title: [{ title: 'The ledger' }] });
    warnOnce(run.service);

    await run.service.turn(1n, 'session-1', 'Take the ledger away from Mara.');
    await run.service.turn(1n, 'session-1', 'Who has it now?');

    const [first, fix, next] = run.chatCalls();
    expect(resumes(wire((fix as Call).messages), wire((next as Call).messages))).toBe(false);
    expect(resumes(wire((first as Call).messages), wire((next as Call).messages))).toBe(true);
  });

  it('should keep the JSON schema in the system prompt of a keyed call, so nothing trails the turn', async () => {
    const run = harness({ chat: [{ reply: 'Noted.' }], title: [{ title: 'Noted' }] });

    await run.service.turn(1n, 'session-1', 'Mara keeps the lighthouse.');

    const sent = wire((run.chatCalls()[0] as Call).messages);
    expect(sent.system).toContain('matching this JSON schema');
    expect(sent.turns.at(-1)?.text).toContain('Mara keeps the lighthouse.');
  });

  it('should keep the conversation when the Story Bible changed, and send only the changed section', async () => {
    const run = harness({ chat: [{ reply: 'Noted.' }, { reply: 'Sold, then.' }], title: [{ title: 'The lighthouse' }] });

    await run.service.turn(1n, 'session-1', 'Mara keeps the lighthouse for now.');
    run.stable.inventory = 'mara (character), lighthouse (location)';
    await run.service.turn(1n, 'session-1', 'Now she sells it.');

    const [first, next] = run.chatCalls();
    const turn = wire((next as Call).messages).turns.at(-1)?.text ?? '';
    expect(resumes(wire((first as Call).messages), wire((next as Call).messages))).toBe(true);
    expect(turn).toContain('## INVENTORY\n\nmara (character), lighthouse (location)');
    expect(turn).not.toContain('## STORY');
  });

  it('should start a new conversation once a compaction folded the earlier turns', async () => {
    const run = harness({ chat: [{ reply: 'One.' }, { reply: 'Two.' }, { reply: 'Three.' }], title: [{ title: 'Counting' }] });

    await run.service.turn(1n, 'session-1', 'Count with me, one.');
    await run.service.turn(1n, 'session-1', 'Two.');
    run.session.summary = 'The author counted to one.';
    run.session.summaryThroughOrdinal = 2;
    await run.service.turn(1n, 'session-1', 'Three.');

    const [, second, third] = run.chatCalls();
    expect(resumes(wire((second as Call).messages), wire((third as Call).messages))).toBe(false);
    expect(wire((third as Call).messages).turns.map(turn => turn.text)).toContain('Conversation so far (compacted summary):\nThe author counted to one.');
  });

  it('should name the conversation on every chat call and on no other call', async () => {
    const run = harness({ chat: [LOOKUP, { reply: 'Under the stairs.' }], title: [{ title: 'The ledger' }] });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');
    await Bun.sleep(0);

    expect(run.chatCalls().map(call => call.session)).toEqual(['dev:1:session-1', 'dev:1:session-1']);
    expect(run.calls.filter(call => call.role === 'title').map(call => call.session)).toEqual([undefined]);
  });

  it('should name the conversation on a turn whose model searches the web itself', async () => {
    const run = harness({ chat: [{ reply: 'Winters there are long.' }, { reply: 'And dark.' }], title: [{ title: 'Winter' }] }, { webMode: 'native' });

    await run.service.turn(1n, 'session-1', 'How long are winters in Tromsø?');
    await run.service.turn(1n, 'session-1', 'And the light?');

    const [first, next] = run.chatCalls();
    expect(run.chatCalls().map(call => [call.session, call.webTools])).toEqual([
      ['dev:1:session-1', true],
      ['dev:1:session-1', true],
    ]);
    expect(resumes(wire((first as Call).messages), wire((next as Call).messages))).toBe(true);
  });
});

describe('ChatService.turn — the selection and the answering model', () => {
  it('should route on the project, never on a pin, tier or mode left in the chat’s retired columns', async () => {
    const run = harness({ chat: [{ reply: 'Under the stairs.' }], title: [{ title: 'The ledger' }] });
    Object.assign(run.session, { modelProvider: 'openrouter', modelId: 'anthropic/claude-opus-5', aliasKey: 'gpt-sol', contentMode: 'unrestricted', costTier: 'economy' });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');

    expect(run.chatCalls()[0]).toMatchObject({ route: { task: 'novel-forge.chat', costTier: 'balanced', contentMode: 'standard' }, session: 'dev:1:session-1' });
  });

  it('should run one turn on its own pace and mode and store neither on the chat', async () => {
    const run = harness({ chat: [{ reply: 'A deeper answer.' }], title: [{ title: 'The ledger' }] });

    const deeper = await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?', undefined, { costTier: 'performant', contentMode: 'unrestricted' });

    expect(run.chatCalls()[0]?.route).toEqual({ task: 'novel-forge.chat', costTier: 'performant', contentMode: 'unrestricted' });
    expect(deeper.assistantMessage).toMatchObject({ costTier: 'performant', contentMode: 'unrestricted' });
    expect(run.sessionSets.length).toBeGreaterThan(0);
    for (const set of run.sessionSets) expect(Object.keys(set).filter(key => ['contentMode', 'costTier', 'aliasKey', 'modelId', 'modelProvider'].includes(key))).toEqual([]);
  });

  it('should refuse a one-shot unrestricted reply before anything is saved while the catalog does not route it', async () => {
    const run = harness({ chat: [{ reply: 'Never sent.' }] }, { unrestrictedAvailable: false });

    await expect(run.service.turn(1n, 'session-1', 'Write it raw.', undefined, { contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });
    expect(run.rows).toHaveLength(0);
    expect(run.calls).toHaveLength(0);
  });

  it('should record on the reply the model Synapse says answered', async () => {
    const run = harness({ chat: [{ reply: 'Under the stairs.' }], title: [{ title: 'The ledger' }] }, { served: { provider: 'subscription', model: 'claude-opus-5.5' } });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');

    expect(run.rows.find(row => row['role'] === 'assistant')).toMatchObject({ modelProvider: 'subscription', modelId: 'claude-opus-5.5' });
  });

  it('should record the chat task against Synapse when no response named the model that answered', async () => {
    const run = harness({ chat: [{ reply: 'Under the stairs.' }], title: [{ title: 'The ledger' }] });

    await run.service.turn(1n, 'session-1', 'Where does Mara hide the ledger?');

    expect(run.rows.find(row => row['role'] === 'assistant')).toMatchObject({ modelProvider: 'synapse', modelId: 'novel-forge.chat' });
  });
});
