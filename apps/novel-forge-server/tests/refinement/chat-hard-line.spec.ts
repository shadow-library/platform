import { describe, expect, it } from 'bun:test';

import { UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { HARD_LINE_LEXICON, isHardLineRefusal } from '@modules/ai/hard-line';
import { ChatService } from '@modules/refinement/chat.service';
import { AppErrorCode } from '@server/classes';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';

/** A term the production lexicon refuses on its own, taken from the lexicon so no such text is written here. */
const PROBE = (HARD_LINE_LEXICON.standalone[0] as RegExp).source.replace(/^\\b\(\?:|\)\\b$/g, '');

const SESSION = {
  id: 'session-1',
  projectId: 1n,
  status: 'active',
  scopeType: 'project',
  scopeRef: null,
  mode: 'manual',
  contentMode: 'unrestricted',
  costTier: null,
  createdAt: new Date(0),
};

function chat() {
  const inserts: unknown[] = [];
  const turns: unknown[] = [];
  const db = {
    query: {
      chatSessions: { findFirst: async () => SESSION },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return { returning: async () => [values] };
      },
    }),
  };
  const modelRouter = {
    resolveFor: async () => UNRESTRICTED_DEFAULTS.chat,
    routeFor: async () => ({ resolved: UNRESTRICTED_DEFAULTS.chat, source: 'tier', costTier: 'balanced', contentMode: 'unrestricted' }),
  };
  const workflowRunService = {
    runChain: async (_projectId: bigint, _graph: string, _target: string, input: unknown) => {
      turns.push(input);
      return { runId: 'run-2', result: { proposal: null } };
    },
  };
  const service = new ChatService(
    { getPostgresClient: () => db } as never,
    { forNovelChat: async () => ({ id: null, renderedStable: '', renderedVolatile: '' }) } as never,
    modelRouter as never,
    workflowRunService as never,
    {} as never,
    {} as never,
    { getRaw: () => [] } as never,
    {} as never,
    { compactIfNeeded: async () => undefined, buildHistory: async () => [] } as never,
    { resolve: async () => ({ writerClass: 'permissive', raised: false, systemMessages: [] }) } as never,
    { publish: () => undefined } as never,
  );
  return { service, inserts, turns };
}

describe('ChatService.turn on the unrestricted route', () => {
  it('should refuse the author’s message before saving it, and let the next turn in the session proceed', async () => {
    const run = chat();

    const err = await run.service.turn(1n, 'session-1', `Write ${PROBE}.`).then(
      () => null,
      (error: unknown) => error,
    );
    await run.service.turn(1n, 'session-1', 'Write the harbour at dawn.');

    expect(isHardLineRefusal(err)).toBe(true);
    expect(err).toMatchObject({ data: { source: 'Your message' } });
    expect(run.inserts).toEqual([]);
    expect(run.turns).toEqual([{ content: 'Write the harbour at dawn.', contentMode: 'unrestricted', costTier: 'balanced' }]);
  });
});

describe('ChatCompactionService.buildHistory', () => {
  const messages = [
    { id: 1n, ordinal: 1, role: 'user', content: `Earlier: ${PROBE}.`, runId: 't1', tokens: 5 },
    { id: 2n, ordinal: 2, role: 'user', content: 'The harbour at dawn.', runId: 't2', tokens: 5 },
  ];
  const db = { query: { chatMessages: { findMany: async () => messages } } };
  const service = new ChatCompactionService({ getPostgresClient: () => db } as never, {} as never, {} as never, {} as never);
  const session = { id: 'session-1', summary: null, summaryThroughOrdinal: 0, contentMode: null, costTier: null } as never;

  it('should leave a message the hard line refuses out of an unrestricted turn’s history', async () => {
    const history = await service.buildHistory(session, { contentMode: 'unrestricted' }, 'unrestricted');

    expect(history.map(message => message.content)).toEqual(['The harbour at dawn.']);
  });
});

describe('ChatCompactionService.compactIfNeeded under the hard line', () => {
  const plain = (list: readonly RegExp[]) =>
    list.map(term => term.source.replace(/^\\b\(\?:|\)\\b$/g, '')).find(term => /^[a-z]+$/.test(term) && !HARD_LINE_LEXICON.explicit.some(other => other.test(term))) ?? '';
  const MINOR = plain(HARD_LINE_LEXICON.minor);
  const SEXUAL_ONLY = plain(HARD_LINE_LEXICON.sexual);

  function compaction(fold: () => Promise<unknown>) {
    const messages = Array.from({ length: 8 }, (_, i) => ({
      id: BigInt(i + 1),
      ordinal: i + 1,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i === 0 ? `Earlier: ${PROBE}.` : `Message ${i + 1}.`,
      runId: `t${i}`,
      tokens: 10,
    }));
    const updates: unknown[] = [];
    const transcripts: string[] = [];
    const db = {
      query: { chatMessages: { findMany: async () => messages } },
      select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve([]), { orderBy: () => ({ limit: async () => [] }) }) }) }),
      update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
    };
    const workflowRunService = {
      runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, fn: (runId: string) => Promise<unknown>) => ({
        runId: 'run-c',
        result: await fn('run-c'),
      }),
    };
    const modelRouter = {
      resolveFor: async () => UNRESTRICTED_DEFAULTS.compact,
      structured: async (_prompt: unknown, input: { transcript: string }) => {
        transcripts.push(input.transcript);
        return fold();
      },
    };
    const pluginPolicy = { resolve: async () => ({ writerClass: 'permissive', raised: false, systemMessages: [] }) };
    const service = new ChatCompactionService({ getPostgresClient: () => db } as never, modelRouter as never, workflowRunService as never, pluginPolicy as never);
    const session = { id: 'session-1', summary: null, summaryThroughOrdinal: 0, contentMode: 'unrestricted', costTier: null } as never;
    return { service, session, updates, transcripts };
  }

  const turn = { contentMode: 'unrestricted', costTier: 'balanced' } as const;

  it('should fold without the message the hard line refuses', async () => {
    const run = compaction(async () => ({ summary: `The ${MINOR} ${SEXUAL_ONLY} came up once.` }));

    const runId = await run.service.compactIfNeeded(1n, run.session, 0, { contentMode: 'unrestricted' }, turn);

    expect(runId).toBe('run-c');
    expect(run.transcripts[0]).not.toContain(PROBE);
    expect(run.transcripts[0]).toContain('Message 2.');
    expect(run.updates).toHaveLength(1);
  });

  it('should skip a fold the hard line refuses rather than fail the turn', async () => {
    const run = compaction(async () => {
      throw AppErrorCode.AI_015.create({ source: 'The generated text', rule: 'standalone-term', sourceRefs: [] });
    });

    const runId = await run.service.compactIfNeeded(1n, run.session, 0, { contentMode: 'unrestricted' }, turn);

    expect(runId).toBeUndefined();
    expect(run.updates).toEqual([]);
  });
});
