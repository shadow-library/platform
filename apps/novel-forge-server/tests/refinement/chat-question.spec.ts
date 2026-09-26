import { describe, expect, it } from 'bun:test';

import { PROGRESS_ITEM_KEYS } from '@server/common';
import { renderQuestionForHistory, sanitizeChatQuestion } from '@modules/refinement/chat-question';
import { ChatService } from '@modules/refinement/chat.service';

const VALID = {
  question: 'Who opposes Mira?',
  why: 'the reader needs someone to root against',
  answers: [
    { title: 'A rival guild', tradeOff: 'crowds out the court politics', recommended: true },
    { title: 'A corrupt council', why: 'raises the stakes citywide' },
  ],
  progressKey: 'opposition',
};

describe('sanitizeChatQuestion', () => {
  it('should keep a well-formed question as it is, minus any unrecognised fields', () => {
    expect(sanitizeChatQuestion(VALID, PROGRESS_ITEM_KEYS)).toEqual(VALID);
  });

  it('should drop a progressKey outside the checklist and keep everything else', () => {
    const candidate = { ...VALID, progressKey: 'not-a-real-key' };
    const result = sanitizeChatQuestion(candidate, PROGRESS_ITEM_KEYS);
    expect(result?.progressKey).toBeUndefined();
    expect(result?.answers).toEqual(VALID.answers);
  });

  it('should drop the whole card when it has fewer than two answers', () => {
    expect(sanitizeChatQuestion({ question: 'x', answers: [{ title: 'only one' }] }, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should drop the whole card when it has more than four answers', () => {
    const answers = Array.from({ length: 5 }, (_, i) => ({ title: `answer ${i}` }));
    expect(sanitizeChatQuestion({ question: 'x', answers }, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should drop the whole card when the question text is missing or blank', () => {
    expect(sanitizeChatQuestion({ answers: VALID.answers }, PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion({ question: '   ', answers: VALID.answers }, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should drop the whole card when an answer is missing its title', () => {
    const candidate = { question: 'x', answers: [{ title: 'fine' }, { why: 'no title here' }] };
    expect(sanitizeChatQuestion(candidate, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should drop the whole card when an answer title is blank', () => {
    const candidate = { question: 'x', answers: [{ title: 'fine' }, { title: '  ' }] };
    expect(sanitizeChatQuestion(candidate, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should ignore a non-boolean recommended flag rather than keep it', () => {
    const candidate = { question: 'x', answers: [{ title: 'a', recommended: 'yes' }, { title: 'b' }] };
    expect(sanitizeChatQuestion(candidate, PROGRESS_ITEM_KEYS)?.answers[0]).toEqual({ title: 'a' });
  });

  it('should reject candidates that are not objects', () => {
    expect(sanitizeChatQuestion(undefined, PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion('nonsense', PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion(null, PROGRESS_ITEM_KEYS)).toBeUndefined();
  });

  it('should drop every mistyped shape a schema-loose field can carry, without throwing', () => {
    expect(sanitizeChatQuestion(null, PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion('just a string, not a card', PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion({ question: 'x', answers: 'not an array' }, PROGRESS_ITEM_KEYS)).toBeUndefined();
    expect(sanitizeChatQuestion({ question: 'x', answers: [{ title: 'a', recommended: 'yes' }, { title: 'b' }] }, PROGRESS_ITEM_KEYS)?.answers[0]).toEqual({ title: 'a' });
    expect(sanitizeChatQuestion({ question: 'x', why: 123, answers: VALID.answers }, PROGRESS_ITEM_KEYS)?.why).toBeUndefined();
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

function chat(output: unknown) {
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  const updates: unknown[] = [];
  const db = {
    query: {
      chatSessions: { findFirst: async () => SESSION },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { returning: async () => [{ id: BigInt(inserts.length), ...values }] };
      },
    }),
    update: () => ({ set: (values: unknown) => ({ where: async () => updates.push(values) }) }),
    select: () => ({ from: () => ({ where: async () => [{ max: 0 }] }) }),
  };
  const modelRouter = {
    routeModel: () => ({ resolved: { provider: 'p', model: 'm' }, source: 'tier', costTier: 'balanced', contentMode: 'standard' }),
    structured: async () => output,
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
    { getRaw: () => [] } as never,
    {} as never,
    { compactIfNeeded: async () => undefined, buildHistory: async () => [] } as never,
    { resolve: async () => ({ writerClass: 'standard', raised: false, systemMessages: [] }) } as never,
    { publish: () => undefined } as never,
    { read: async () => ({ text: '' }) } as never,
  );
  return { service, inserts, updates };
}

function assistantValues(inserts: { table: unknown; values: Record<string, unknown> }[]) {
  return inserts.find(insert => insert.values['role'] === 'assistant')?.values;
}

describe('renderQuestionForHistory', () => {
  it('should list the question with its answer titles', () => {
    expect(renderQuestionForHistory({ question: 'Which way?', answers: [{ title: 'North' }, { title: 'South' }] })).toBe('[Asked: Which way? — options: North / South]');
  });

  it('should bound a long question and long titles so history stays short', () => {
    const line = renderQuestionForHistory({ question: 'word '.repeat(100), answers: [{ title: 'long '.repeat(40) }, { title: 'B' }] });
    expect(line?.length).toBeLessThan(260);
  });

  it('should render nothing for a malformed value', () => {
    expect(renderQuestionForHistory(null)).toBeNull();
    expect(renderQuestionForHistory({ question: 3 })).toBeNull();
  });
});

describe('ChatService.turn — question card', () => {
  it('should persist a well-formed question beside the reply', async () => {
    const run = chat({ reply: 'Here is the choice.', question: VALID });

    await run.service.turn(1n, 'session-1', 'Who should oppose Mira?');

    expect(assistantValues(run.inserts)).toMatchObject({ content: 'Here is the choice.', question: VALID });
  });

  it('should drop a malformed question and keep the reply — the turn never fails', async () => {
    const run = chat({ reply: 'Still thinking about the ending.', question: { question: 'How does it end?', answers: [{ title: 'only one' }] } });

    const result = await run.service.turn(1n, 'session-1', 'How should the book end?');

    expect(result.assistantMessage.content).toBe('Still thinking about the ending.');
    expect(assistantValues(run.inserts)?.['question']).toBeUndefined();
  });

  it('should drop a progressKey outside the checklist while keeping the rest of the card', async () => {
    const run = chat({ reply: 'Here is the choice.', question: { ...VALID, progressKey: 'not-a-real-key' } });

    await run.service.turn(1n, 'session-1', 'Who should oppose Mira?');

    const question = assistantValues(run.inserts)?.['question'] as typeof VALID;
    expect(question.progressKey).toBeUndefined();
    expect(question.answers).toEqual(VALID.answers);
  });

  it('should never fail the turn on a mistyped question — a stray null still parses, drops, and keeps the reply', async () => {
    const run = chat({ reply: 'Still deciding.', question: null });

    const result = await run.service.turn(1n, 'session-1', 'How should the book end?');

    expect(result.assistantMessage.content).toBe('Still deciding.');
    expect(assistantValues(run.inserts)?.['question']).toBeUndefined();
  });

  it('should leave the question column unset when the reply raises none', async () => {
    const run = chat({ reply: 'Just discussing pacing.' });

    await run.service.turn(1n, 'session-1', 'What do you think of the pacing?');

    expect(assistantValues(run.inserts)?.['question']).toBeUndefined();
  });
});
