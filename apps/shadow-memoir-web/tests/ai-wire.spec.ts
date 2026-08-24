import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DeltaPage, SyncedReflectProvider } from '@/lib/sync';

import { createTestEngine } from './sync-harness';

const TODAY = '2026-08-24';

interface HttpCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

interface HttpReply {
  status?: number;
  body?: unknown;
}

function httpFake(handlers: Record<string, () => HttpReply>): HttpCall[] {
  const calls: HttpCall[] = [];

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://memoir.test').pathname;
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });

    const handler = handlers[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ code: 'TEST_404', type: 'NotFound', message: `no handler for ${method} ${path}` }), { status: 404 });

    const reply = handler();
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });

  return calls;
}

function page(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, domains, tombstones: [] };
}

async function provider(domains: DeltaPage['domains'] = {}): Promise<SyncedReflectProvider> {
  const { engine } = createTestEngine({ pages: [page(domains)], today: TODAY });
  await engine.start();
  return new SyncedReflectProvider(engine);
}

const TASK = {
  id: 'task-1',
  queryText: 'Why do Thursdays keep failing?',
  status: 'done',
  kind: 'adhoc',
  submittedAt: '2026-08-24T09:00:00.000Z',
  expectedBy: '2026-08-24T22:00:00.000Z',
  quotaMonth: new Date().toISOString().slice(0, 7),
  quotaConsumed: true,
  error: null,
};

const RESULT = {
  id: '77',
  taskId: 'task-1',
  answer: 'Thursday carries five occurrences against a median of three.',
  patterns: ['Every miss this fortnight was an evening quest.'],
  suggestions: [{ kind: 'shift_time', questId: '12', text: 'Move the strength session off Thursday' }],
  limitationNote: 'Fourteen days is a short window.',
  createdAt: '2026-08-25T06:02:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('Coaching consent', () => {
  it('should hold an owner who has never decided at the gate', async () => {
    httpFake({});
    const coach = await (await provider()).getCoach();
    expect(coach.consent).toEqual({ journal: false, health: false, decided: false });
  });

  it('should read the granted classes from the mirrored consent rows', async () => {
    httpFake({});
    const coach = await (
      await provider({
        ai_consents: [
          { dataClass: 'journal_reflection_reason', grantedAt: '2026-08-01T00:00:00.000Z', withdrawnAt: null },
          { dataClass: 'health', grantedAt: '2026-08-01T00:00:00.000Z', withdrawnAt: '2026-08-10T00:00:00.000Z' },
        ],
      })
    ).getCoach();

    expect(coach.consent).toEqual({ journal: true, health: false, decided: true });
  });

  it('should send both classes as one grant list', async () => {
    const calls = httpFake({ 'PUT /api/v1/ai/consents': () => ({ body: { consents: [] } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.setConsent', consent: { journal: true, health: false } });
    expect(result.status).toBe('applied');
    expect(calls.at(-1)?.body).toEqual({
      grants: [
        { dataClass: 'journal_reflection_reason', granted: true },
        { dataClass: 'health', granted: false },
      ],
    });
  });
});

describe('Coaching requests', () => {
  it('should submit a question with a client-minted id', async () => {
    const calls = httpFake({ 'POST /api/v1/ai/tasks': () => ({ status: 201, body: { ...TASK, status: 'pending' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: '  Why do Thursdays keep failing?  ' });
    expect(result.status).toBe('applied');
    expect(calls.at(-1)?.body).toMatchObject({ queryText: 'Why do Thursdays keep failing?' });
    expect(String(calls.at(-1)?.body?.['id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should never reach the server with an empty question', async () => {
    const calls = httpFake({});
    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: '   ' });

    expect(result.status).toBe('rejected');
    expect(calls).toHaveLength(0);
  });

  it('should turn the free-tier paywall into a plan sentence rather than an error', async () => {
    httpFake({
      'POST /api/v1/ai/tasks': () => ({
        status: 402,
        body: { code: 'AI_001', type: 'Forbidden', message: 'Free-tier AI quota exhausted for this month; upgrade to submit more questions' },
      }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    expect(result).toMatchObject({ status: 'rejected' });
    expect(result.message).toContain('Coach raises the allowance');
  });

  it('should surface the daily cap in the server’s own words', async () => {
    httpFake({ 'POST /api/v1/ai/tasks': () => ({ status: 429, body: { code: 'AI_002', type: 'BadRequest', message: 'Daily AI quota exhausted; try again tomorrow' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    expect(result).toMatchObject({ status: 'rejected', message: 'Daily AI quota exhausted; try again tomorrow' });
  });

  it('should refuse to cancel a task the worker already claimed', async () => {
    httpFake({
      'POST /api/v1/ai/tasks/task-1/cancel': () => ({ status: 409, body: { code: 'AI_004', type: 'Conflict', message: 'This task is no longer pending and cannot be cancelled' } }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'ai.cancel', requestId: 'task-1' });
    expect(result).toMatchObject({ status: 'rejected', message: 'This task is no longer pending and cannot be cancelled' });
  });

  it('should count only this month’s charged tasks against the free allowance', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [TASK, { ...TASK, id: 'task-0', quotaMonth: '2020-01' }] })).getCoach();

    expect(coach.quota).toMatchObject({ used: 1, limit: 2, planName: 'Free' });
  });

  it('should drop the monthly count on a paid entitlement', async () => {
    httpFake({});
    const coach = await (await provider({ entitlement: [{ tier: 'paid', state: 'active', trialUsed: true }] })).getCoach();

    expect(coach.quota).toMatchObject({ limit: null, planName: 'Coach' });
  });
});

describe('Coaching results', () => {
  it('should render the answer, its patterns and its offers from the mirrored rows', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [TASK], ai_results: [RESULT] })).getCoach();

    expect(coach.active).toBeNull();
    expect(coach.latest?.title).toBe('Why do Thursdays keep failing?');
    expect(coach.latest?.findings.map(finding => finding.body)).toEqual([RESULT.answer, RESULT.patterns[0]]);
    expect(coach.latest?.limitationNote).toBe('Fourteen days is a short window.');
    expect(coach.latest?.suggestions[0]).toMatchObject({ index: 0, label: 'Move the strength session off Thursday', to: '/quests/12' });
  });

  it('should show a queued task at the top and offer to cancel it', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [{ ...TASK, status: 'pending' }] })).getCoach();

    expect(coach.active).toMatchObject({ id: 'task-1', state: 'queued' });
    expect(coach.latest).toBeNull();
  });

  it('should record an applied offer without changing the quest itself', async () => {
    const calls = httpFake({
      'POST /api/v1/ai/results/77/apply': () => ({ body: { id: '1', resultId: '77', suggestionIndex: 0, questId: '12', appliedAt: '2026-08-25T07:00:00.000Z' } }),
    });

    const { engine } = createTestEngine({ pages: [page({ ai_tasks: [TASK], ai_results: [RESULT] })], today: TODAY });
    await engine.start();

    const result = await new SyncedReflectProvider(engine).dispatchCommand({ type: 'ai.applySuggestion', resultId: '77', suggestionIndex: 0 });
    expect(result.status).toBe('applied');
    expect(result.message).toContain('unchanged until you make the edit yourself');
    expect(calls.at(-1)?.body).toEqual({ suggestionIndex: 0 });
    expect(await engine.outbox.pending()).toHaveLength(0);
  });
});
