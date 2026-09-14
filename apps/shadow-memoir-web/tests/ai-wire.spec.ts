import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DeltaPage, SyncedReflectProvider, type SyncEngine } from '@/lib/sync';

import { httpFake } from './http-fake';
import { withTimeZone } from './setup';
import { createTestEngine } from './sync-harness';

const TODAY = '2026-08-24';

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

const DECLINED = (dataClass: string): Record<string, unknown> => ({ dataClass, grantedAt: '2026-08-20T00:00:00.000Z', withdrawnAt: '2026-08-20T00:00:00.000Z' });

const DECIDED_ELSEWHERE = { code: 'AI_011', type: 'Conflict', message: 'AI consent has already been decided for this account' };

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

  it('should send a first decision as a write the server records only if undecided', async () => {
    const { calls } = httpFake({ 'PUT /api/v1/ai/consents': () => ({ body: { consents: [] } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.setConsent', consent: { journal: true, health: false } });
    expect(result.status).toBe('applied');
    expect(calls.some(call => call.method === 'GET')).toBe(false);
    expect(calls.at(-1)?.body).toEqual({
      grants: [
        { dataClass: 'journal_reflection_reason', granted: true },
        { dataClass: 'health', granted: false },
      ],
      onlyIfUndecided: true,
    });
  });

  it('should change an already decided consent with the normal write', async () => {
    const { calls } = httpFake({ 'PUT /api/v1/ai/consents': () => ({ body: { consents: [] } }) });

    const reflect = await provider({ ai_consents: [DECLINED('journal_reflection_reason'), DECLINED('health')] });
    const result = await reflect.dispatchCommand({ type: 'ai.setConsent', consent: { journal: false, health: true } });
    expect(result.status).toBe('applied');
    expect(calls.at(-1)?.body).toMatchObject({ onlyIfUndecided: false });
  });

  it('should say the choice was made on another device when a first decision is refused', async () => {
    httpFake({ 'PUT /api/v1/ai/consents': () => ({ status: 409, body: DECIDED_ELSEWHERE }) });
    const decidedElsewhere = page({ ai_consents: [{ dataClass: 'journal_reflection_reason', grantedAt: '2026-08-20T00:00:00.000Z', withdrawnAt: null }, DECLINED('health')] });
    const { engine } = createTestEngine({ pages: [page({}), decidedElsewhere], today: TODAY });
    await engine.start();
    const reflect = new SyncedReflectProvider(engine);

    const result = await reflect.dispatchCommand({ type: 'ai.setConsent', consent: { journal: false, health: false } });
    expect(result).toMatchObject({
      status: 'rejected',
      message: 'Your consent choice was already made on another device, so nothing was changed here.',
      error: { code: 'AI_011' },
    });
    expect((await reflect.getCoach()).consent).toEqual({ journal: true, health: false, decided: true });
  });

  it('should count a refused first decision that matches the stored choice as saved', async () => {
    httpFake({ 'PUT /api/v1/ai/consents': () => ({ status: 409, body: DECIDED_ELSEWHERE }) });
    const { engine } = createTestEngine({ pages: [page({}), page({ ai_consents: [DECLINED('journal_reflection_reason'), DECLINED('health')] })], today: TODAY });
    await engine.start();
    const reflect = new SyncedReflectProvider(engine);

    const result = await reflect.dispatchCommand({ type: 'ai.setConsent', consent: { journal: false, health: false } });
    expect(result.status).toBe('applied');
    expect((await reflect.getCoach()).consent).toEqual({ journal: false, health: false, decided: true });
  });

  it('should re-check the stored consent after a sync that started before the refusal', async () => {
    const serverRows: Record<string, unknown>[] = [];
    let releaseStalePull = (): void => undefined;
    let stalePull: Promise<void> | null = null;
    let pulls = 0;
    const { engine } = createTestEngine({
      today: TODAY,
      fetchImpl: server => async (input, init) => {
        if (!String(input).includes('/sync/delta')) return server.fetchImpl(input, init);
        pulls += 1;
        const rows = [...serverRows];
        if (stalePull) await stalePull;
        return new Response(JSON.stringify({ ...page({ ai_consents: rows }), cursor: String(pulls) }), {
          status: 200,
          headers: { 'x-sync-epoch': server.epoch, 'content-type': 'application/json' },
        });
      },
    });
    await engine.start();
    const reflect = new SyncedReflectProvider(engine);

    stalePull = new Promise<void>(resolve => (releaseStalePull = resolve));
    const background = engine.sync({ background: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    serverRows.push(DECLINED('journal_reflection_reason'), DECLINED('health'));
    httpFake({ 'PUT /api/v1/ai/consents': () => ({ status: 409, body: DECIDED_ELSEWHERE }) });

    const pending = reflect.dispatchCommand({ type: 'ai.setConsent', consent: { journal: false, health: false } });
    await new Promise(resolve => setTimeout(resolve, 20));
    stalePull = null;
    releaseStalePull();
    await background;

    expect((await pending).status).toBe('applied');
    expect((await reflect.getCoach()).consent).toEqual({ journal: false, health: false, decided: true });
  });
});

describe('Coaching requests', () => {
  it('should submit a question with a client-minted id', async () => {
    const { calls } = httpFake({ 'POST /api/v1/ai/tasks': () => ({ status: 201, body: { ...TASK, status: 'pending' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: '  Why do Thursdays keep failing?  ' });
    expect(result.status).toBe('applied');
    expect(calls.at(-1)?.body).toMatchObject({ queryText: 'Why do Thursdays keep failing?' });
    expect(String(calls.at(-1)?.body?.['id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should resubmit an unanswered question under the same id', async () => {
    let attempt = 0;
    const { calls } = httpFake({
      'POST /api/v1/ai/tasks': () => (attempt++ === 0 ? { status: 503, body: { code: 'S001', type: 'Unavailable', message: 'down' } } : { status: 201, body: TASK }),
    });
    const reflect = await provider();

    expect(await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' })).toMatchObject({ status: 'rejected', error: { kind: 'unavailable' } });
    expect(await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' })).toMatchObject({ status: 'applied' });

    const ids = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it('should reuse the idempotency key for a repeated submit', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    let attempt = 0;
    const { calls } = httpFake({
      'POST /api/v1/ai/tasks': async () => {
        if (attempt++ === 0) return { status: 503, body: { code: 'S001', type: 'Unavailable', message: 'down' } };
        await held;
        return { status: 201, body: TASK };
      },
    });
    const reflect = await provider();
    const submit = (): Promise<unknown> => reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });

    await submit();
    const first = submit();
    const second = submit();
    release();
    expect(await Promise.all([first, second])).toEqual([expect.objectContaining({ status: 'applied' }), expect.objectContaining({ status: 'applied' })]);

    const ids = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  it('should mint a new id once the pending submission is in the mirror', async () => {
    let attempt = 0;
    const { calls } = httpFake({
      'POST /api/v1/ai/tasks': () => (attempt++ === 0 ? { status: 503, body: { code: 'S001', type: 'Unavailable', message: 'down' } } : { status: 201, body: TASK }),
    });
    const later = page({});
    const { engine } = createTestEngine({ pages: [page({}), later], today: TODAY });
    await engine.start();
    const reflect = new SyncedReflectProvider(engine);

    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    const [firstId] = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    later.domains = { ai_tasks: [{ ...TASK, id: String(firstId), status: 'pending' }] };
    await engine.sync();
    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });

    const ids = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(firstId);
  });

  it('should mint a new id after the server refused the question', async () => {
    let attempt = 0;
    const { calls } = httpFake({
      'POST /api/v1/ai/tasks': () =>
        attempt++ === 0 ? { status: 402, body: { code: 'AI_001', type: 'Forbidden', message: 'Free-tier AI quota exhausted' } } : { status: 201, body: TASK },
    });
    const reflect = await provider();

    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });

    const ids = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    expect(new Set(ids).size).toBe(2);
  });

  it('should mint a new id once a question has been accepted', async () => {
    const { calls } = httpFake({ 'POST /api/v1/ai/tasks': () => ({ status: 201, body: TASK }) });
    const reflect = await provider();

    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    await reflect.dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });

    const ids = calls.filter(call => call.path === '/api/v1/ai/tasks').map(call => call.body?.['id']);
    expect(new Set(ids).size).toBe(2);
  });

  it('should never reach the server with an empty question', async () => {
    const { calls } = httpFake({});
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

  it('should surface the daily cap in owner copy as a request worth retrying', async () => {
    httpFake({ 'POST /api/v1/ai/tasks': () => ({ status: 429, body: { code: 'AI_002', type: 'BadRequest', message: 'Daily AI quota exhausted; try again tomorrow' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'ai.submit', question: 'Why do Thursdays keep failing?' });
    expect(result).toMatchObject({ status: 'rejected', message: 'Today’s requests are used up. Try again tomorrow.', error: { code: 'AI_002', kind: 'unavailable' } });
  });

  it('should refuse to cancel a task the worker already claimed', async () => {
    httpFake({
      'POST /api/v1/ai/tasks/task-1/cancel': () => ({ status: 409, body: { code: 'AI_004', type: 'Conflict', message: 'This task is no longer pending and cannot be cancelled' } }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'ai.cancel', requestId: 'task-1' });
    expect(result).toMatchObject({ status: 'rejected', message: 'It has already started, so it can’t be cancelled.', error: { code: 'AI_004', kind: 'refusal' } });
  });

  it('should resync when cancel conflicts', async () => {
    httpFake({
      'POST /api/v1/ai/tasks/task-1/cancel': () => ({ status: 409, body: { code: 'AI_004', type: 'Conflict', message: 'This task is no longer pending and cannot be cancelled' } }),
    });
    const { engine, server } = createTestEngine({ pages: [page({ ai_tasks: [{ ...TASK, status: 'pending' }] }), page({ ai_tasks: [TASK], ai_results: [RESULT] })], today: TODAY });
    await engine.start();
    const reflect = new SyncedReflectProvider(engine);
    expect((await reflect.getCoach()).active).toMatchObject({ id: 'task-1', state: 'queued' });
    const pulls = server.deltaRequests.length;

    const result = await reflect.dispatchCommand({ type: 'ai.cancel', requestId: 'task-1' });

    expect(server.deltaRequests.length).toBeGreaterThan(pulls);
    expect(result).toMatchObject({ status: 'rejected', message: 'It had already finished, so there was nothing to cancel. The answer is below.', error: { code: 'AI_004' } });
    const coach = await reflect.getCoach();
    expect(coach.active).toBeNull();
    expect(coach.results[0]?.id).toBe('77');
  });

  it('should keep the worker’s error text out of a failed request', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [{ ...TASK, status: 'failed', error: 'inference timeout after 30000ms' }] })).getCoach();

    expect(coach.active).toMatchObject({ state: 'failed' });
    expect(coach.active?.when).not.toContain('inference');
    expect(coach.history[0]?.when).not.toContain('inference');
  });

  it('should title a held nightly summary the same on the card and in the history', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [{ ...TASK, kind: 'scheduled', status: 'held_upgrade', queryText: 'What did yesterday say about this week?' }] })).getCoach();

    expect(coach.active).toMatchObject({ state: 'held', question: 'Nightly summary' });
    expect(coach.history[0]?.title).toBe('Nightly summary');
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

  it('should count the quota month and its reset in the account’s time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-08-31T12:00:00.000Z') });
    try {
      httpFake({});
      const coach = await (
        await provider({
          account: [{ id: 'account-a', timezone: 'Pacific/Kiritimati' }],
          ai_tasks: [
            { ...TASK, quotaMonth: '2026-09' },
            { ...TASK, id: 'task-0', quotaMonth: '2026-08' },
          ],
        })
      ).getCoach();

      expect(coach.quota).toMatchObject({ used: 1, resetsOn: '1 October' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should count today’s charged requests on a paid entitlement', async () => {
    httpFake({});
    const now = new Date().toISOString();
    const coach = await (
      await provider({
        entitlement: [{ tier: 'paid', state: 'active', trialUsed: true }],
        ai_tasks: [
          { ...TASK, submittedAt: now },
          { ...TASK, id: 'task-0', submittedAt: '2020-01-01T09:00:00.000Z' },
        ],
      })
    ).getCoach();

    expect(coach.quota.used).toBe(1);
  });
});

describe('Coaching refresh', () => {
  it('should refresh over a ready mirror', async () => {
    const { engine, server } = createTestEngine({ pages: [page({})], today: TODAY });
    await engine.start();
    const pulls = server.deltaRequests.length;

    expect(await new SyncedReflectProvider(engine).refreshCoach()).toBe('refreshed');
    expect(server.deltaRequests.length).toBeGreaterThan(pulls);
  });

  it('should skip a background refresh while signed out', async () => {
    let status = 401;
    const { engine, server } = createTestEngine({ status: () => status, today: TODAY });
    await engine.start();
    expect(engine.getSnapshot().state).toBe('signed-out');
    status = 200;
    const pulls = server.deltaRequests.length;

    expect(await new SyncedReflectProvider(engine).refreshCoach()).toBe('skipped');
    expect(server.deltaRequests.length).toBe(pulls);
  });

  it('should report a failed background refresh so the caller can back off', async () => {
    let status = 200;
    const { engine } = createTestEngine({ pages: [page({})], status: () => status, today: TODAY });
    await engine.start();
    status = 500;

    expect(await new SyncedReflectProvider(engine).refreshCoach()).toBe('failed');
  });
});

describe('SyncEngine background pass', () => {
  function recordStates(engine: SyncEngine): string[] {
    const states: string[] = [];
    engine.subscribe(() => states.push(engine.getSnapshot().state));
    return states;
  }

  it('should announce a background pass that has queued commands', async () => {
    const { engine } = createTestEngine({ pages: [page({})], today: TODAY });
    await engine.start();
    try {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      await engine.enqueue({ type: 'quest.complete', occurrenceId: `a:${TODAY}` }, TODAY);
      expect(engine.getSnapshot().queuedCount).toBe(1);
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
    const states = recordStates(engine);

    await engine.sync({ background: true });

    expect(states).toContain('syncing');
  });

  it('should surface a failed background pass', async () => {
    let status = 200;
    const { engine } = createTestEngine({ pages: [page({})], status: () => status, today: TODAY });
    await engine.start();
    status = 500;
    const states = recordStates(engine);

    await engine.sync({ background: true });

    expect(states).not.toContain('syncing');
    expect(engine.getSnapshot().state).toBe('failed');
  });
});

describe('Coaching results', () => {
  it('should render the answer, its patterns and its offers from the mirrored rows', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [TASK], ai_results: [RESULT] })).getCoach();

    expect(coach.active).toBeNull();
    expect(coach.results[0]?.title).toBe('Why do Thursdays keep failing?');
    expect(coach.results[0]?.findings.map(finding => finding.body)).toEqual([RESULT.answer, RESULT.patterns[0]]);
    expect(coach.results[0]?.limitationNote).toBe('Fourteen days is a short window.');
    expect(coach.results[0]?.suggestions[0]).toMatchObject({ index: 0, label: 'Move the strength session off Thursday', to: '/quests/12' });
  });

  it('should show a queued task at the top and offer to cancel it', async () => {
    httpFake({});
    const coach = await (await provider({ ai_tasks: [{ ...TASK, status: 'pending' }] })).getCoach();

    expect(coach.active).toMatchObject({ id: 'task-1', state: 'queued' });
    expect(coach.results).toEqual([]);
  });

  it('should record an applied offer without changing the quest itself', async () => {
    const { calls } = httpFake({
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

describe('Coaching timestamps', () => {
  it('should show the submitted/expected time, the result date and the history date in the local zone, not raw UTC', async () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({});
      const coach = await (
        await provider({
          ai_tasks: [
            { ...TASK, status: 'pending' },
            { ...TASK, id: 'task-2', status: 'done' },
          ],
          ai_results: [RESULT],
        })
      ).getCoach();

      expect(coach.active?.when).toBe('submitted 11:00 · expected by 00:00');
      expect(coach.results[0]?.meta).toBe('Ready 25 August, 08:02');
      expect(coach.history.find(item => item.id === 'task-2')?.when).toBe('24 Aug 2026');
      expect(coach.history.every(item => !/\d{4}-\d{2}-\d{2}T/.test(item.when))).toBe(true);
    }));
});
