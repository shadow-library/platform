import { describe, expect, it } from 'bun:test';

import { COST_TIER_DEFAULTS } from '@modules/ai/defaults';
import { type ProjectConfig } from '@modules/ai/model-router.service';
import { ChatCompactionService, UNRESTRICTED_REPLY_PLACEHOLDER, UNRESTRICTED_SUMMARY_PLACEHOLDER } from '@modules/refinement/chat-compaction.service';
import { type ChatSelection } from '@modules/refinement/chat-selection';

interface Scenario {
  turnModes?: Record<string, string | null>;
  summaryMode?: string | null;
  summary?: string | null;
  sessionMode?: 'standard' | 'unrestricted' | null;
  questions?: Record<number, unknown>;
}

function message(ordinal: number, questions: Record<number, unknown> = {}) {
  const turn = `t${Math.ceil(ordinal / 2)}`;
  const role = ordinal % 2 === 1 ? 'user' : 'assistant';
  return { id: BigInt(ordinal), ordinal, role, content: `${role} ${turn}`, runId: turn, tokens: 10, question: questions[ordinal] ?? null };
}

function fakeCompaction(scenario: Scenario = {}) {
  const messages = [1, 2, 3, 4, 5, 6, 7, 8].map(ordinal => message(ordinal, scenario.questions));
  const turnModes = scenario.turnModes ?? {};
  const runs: unknown[] = [];
  const calls: { project: ProjectConfig; policy: unknown }[] = [];
  const db = {
    query: { chatMessages: { findMany: async () => messages } },
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const turnRows = Object.entries(turnModes).map(([id, contentMode]) => ({ id, costTier: null, contentMode }));
          return Object.assign(Promise.resolve('id' in columns ? turnRows : []), {
            orderBy: () => ({ limit: async () => (scenario.summaryMode === undefined ? [] : [{ contentMode: scenario.summaryMode }]) }),
          });
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  const workflowRunService = {
    runChain: async (_projectId: bigint, graph: string, _target: string, input: unknown, fn: (runId: string) => Promise<unknown>) => {
      runs.push({ graph, input });
      return { runId: 'run-c', result: await fn('run-c') };
    },
  };
  const modelRouter = {
    resolveModel: () => COST_TIER_DEFAULTS.economy.unrestricted.helper,
    structured: async (_prompt: unknown, _input: unknown, _ctx: unknown, project: ProjectConfig, policy: unknown) => {
      calls.push({ project, policy });
      return { summary: 'folded' };
    },
  };
  const pluginPolicy = { resolve: async () => ({ writerClass: 'permissive' }) };
  const service = new ChatCompactionService({ getPostgresClient: () => db } as never, modelRouter as never, workflowRunService as never, pluginPolicy as never);
  const session = { id: 'session-1', summary: scenario.summary ?? null, summaryThroughOrdinal: 0, contentMode: scenario.sessionMode ?? null, costTier: null } as never;
  return { service, session, runs, calls };
}

const standardTurn: ChatSelection = { contentMode: 'standard', costTier: 'economy' };
const standardNovel: ProjectConfig = { contentMode: 'standard', costTier: 'balanced' };

describe('ChatCompactionService.compactIfNeeded', () => {
  it('should fold on the standard route when nothing in the chat is unrestricted', async () => {
    const { service, session, runs, calls } = fakeCompaction({ turnModes: { t1: 'standard' } });

    await service.compactIfNeeded(1n, session, 0, standardNovel, standardTurn);

    expect(runs).toEqual([{ graph: 'chat-compact', input: { watermark: 2, contentMode: 'standard' } }]);
    expect(calls[0]).toMatchObject({ project: { contentMode: 'standard', costTier: 'economy' }, policy: undefined });
  });

  it.each([
    ['this turn is unrestricted', { turnModes: { t1: 'standard' } }, standardNovel, { contentMode: 'unrestricted', costTier: 'economy' }],
    ['the novel is unrestricted though its chat is set to standard', { turnModes: { t1: 'standard' }, sessionMode: 'standard' }, { contentMode: 'unrestricted' }, standardTurn],
    ['the chat is unrestricted', { turnModes: { t1: 'standard' }, sessionMode: 'unrestricted' }, standardNovel, standardTurn],
    ['a folded reply was written unrestricted', { turnModes: { t1: 'unrestricted' } }, standardNovel, standardTurn],
    ['the prior summary was written unrestricted', { turnModes: { t1: 'standard' }, summary: 'earlier', summaryMode: 'unrestricted' }, standardNovel, standardTurn],
  ] as const)('should fold on the unrestricted route when %s', async (_name, scenario, project, turn) => {
    const { service, session, runs, calls } = fakeCompaction(scenario as Scenario);

    await service.compactIfNeeded(1n, session, 0, project as ProjectConfig, turn as ChatSelection);

    expect(runs).toEqual([{ graph: 'chat-compact', input: { watermark: 2, contentMode: 'unrestricted' } }]);
    expect(calls[0]).toMatchObject({ project: { contentMode: 'unrestricted', costTier: turn.costTier }, policy: { writerClass: 'permissive' } });
  });
});

describe('ChatCompactionService.buildHistory', () => {
  const turnModes = { t1: 'unrestricted', t2: 'standard', t3: null, t4: 'standard' };

  it('should hide unrestricted replies and an unrestricted summary from a standard turn, keeping the author’s messages', async () => {
    const { service, session } = fakeCompaction({ turnModes, summary: 'earlier', summaryMode: 'unrestricted' });

    const history = await service.buildHistory(session, standardNovel, 'standard');

    expect(history.map(entry => entry.content)).toEqual([
      `Conversation so far (compacted summary):\n${UNRESTRICTED_SUMMARY_PLACEHOLDER}`,
      'user t1',
      UNRESTRICTED_REPLY_PLACEHOLDER,
      'user t2',
      'assistant t2',
      'user t3',
      'assistant t3',
      'user t4',
      'assistant t4',
    ]);
  });

  it('should treat replies that predate the selection as written in the novel’s own mode', async () => {
    const { service, session } = fakeCompaction({ turnModes: { t1: 'standard' } });

    const history = await service.buildHistory(session, { contentMode: 'unrestricted' }, 'standard');

    expect(history.filter(entry => entry.content === UNRESTRICTED_REPLY_PLACEHOLDER)).toHaveLength(3);
  });

  it('should replay everything verbatim to an unrestricted turn', async () => {
    const { service, session } = fakeCompaction({ turnModes, summary: 'earlier', summaryMode: 'unrestricted' });

    const history = await service.buildHistory(session, standardNovel, 'unrestricted');

    expect(history[0]?.content).toBe('Conversation so far (compacted summary):\nearlier');
    expect(history.map(entry => entry.content)).toContain('assistant t1');
    expect(history.map(entry => entry.content)).not.toContain(UNRESTRICTED_REPLY_PLACEHOLDER);
  });

  const QUESTION = { question: 'Who opposes Mira?', answers: [{ title: 'A rival guild' }, { title: 'A corrupt council' }] };

  it('should append a short "[Asked: …]" line to a standard reply that raised a question', async () => {
    const { service, session } = fakeCompaction({ turnModes: { t2: 'standard' }, questions: { 4: QUESTION } });

    const history = await service.buildHistory(session, standardNovel, 'standard');

    expect(history.map(entry => entry.content)).toContain('assistant t2\n\n[Asked: Who opposes Mira? — options: A rival guild / A corrupt council]');
  });

  it('should drop the question along with the reply when the reply was written unrestricted', async () => {
    const { service, session } = fakeCompaction({ turnModes: { t1: 'unrestricted' }, questions: { 2: QUESTION } });

    const history = await service.buildHistory(session, standardNovel, 'standard');

    expect(history.map(entry => entry.content)).toContain(UNRESTRICTED_REPLY_PLACEHOLDER);
    expect(history.map(entry => entry.content).join('\n')).not.toContain('Who opposes Mira?');
  });
});
