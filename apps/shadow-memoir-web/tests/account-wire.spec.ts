import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AccountResponseDto } from '@/lib/apis';
import { type DeltaPage, SyncedAccountProvider } from '@/lib/sync';

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

interface HttpFake {
  calls: HttpCall[];
}

function httpFake(handlers: Record<string, (call: HttpCall, attempt: number) => HttpReply>): HttpFake {
  const fake: HttpFake = { calls: [] };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://memoir.test').pathname;
    const method = init?.method ?? 'GET';
    const call: HttpCall = { method, path, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };

    const attempt = fake.calls.filter(previous => previous.method === method && previous.path === path).length;
    fake.calls.push(call);

    const handler = handlers[`${method} ${path}`];
    if (!handler) return new Response(JSON.stringify({ code: 'TEST_404', type: 'NotFound', message: `no handler for ${method} ${path}` }), { status: 404 });

    const reply = handler(call, attempt);
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  });

  return fake;
}

function account(overrides: Partial<AccountResponseDto> = {}): AccountResponseDto {
  return {
    id: '1',
    authProvider: 'google',
    defaultCurrency: 'EUR',
    enabledCurrencies: ['EUR'],
    timezone: 'Europe/Oslo',
    scheduleStartMin: 390,
    scheduleEndMin: 1350,
    theme: 'system',
    weekStart: 1,
    intensityMode: 'standard',
    returnerThresholdDays: 7,
    notificationPrefs: { weeklyDigest: false, aiReadiness: false, billingReminders: false },
    onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
    level: 1,
    totalXp: '0',
    coins: 0,
    statDiscipline: 0,
    statBody: 0,
    statWealth: 0,
    statMind: 0,
    hpToday: 3,
    hpStartToday: 3,
    hpMax: 3,
    warmthState: 'steady',
    featureFlags: {},
    ocrQuotaCount: 0,
    deletionState: 'none',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, domains, tombstones: [] };
}

async function provider(domains: DeltaPage['domains'] = {}): Promise<SyncedAccountProvider> {
  const { engine } = createTestEngine({ pages: [page(domains)], today: TODAY });
  await engine.start();
  return new SyncedAccountProvider(engine);
}

afterEach(() => vi.unstubAllGlobals());

describe('Account settings over the wire', () => {
  it('should map the account row onto the day preferences', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ body: account() }) });

    const day = await (await provider()).getDay();
    expect(day).toMatchObject({ wakeTime: '06:30', sleepTime: '22:30', timezone: 'Europe/Oslo', currency: 'EUR', currencyLocked: true, intensity: 'standard' });
  });

  it('should show a staged timezone as pending rather than as the live one', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ body: account({ pendingTimezone: 'Europe/Lisbon', pendingIntensityMode: 'low_intensity' }) }) });

    const day = await (await provider()).getDay();
    expect(day).toMatchObject({ timezone: 'Europe/Oslo', pendingTimezone: 'Europe/Lisbon', intensity: 'standard', pendingIntensity: 'gentle' });
  });

  it('should send a wake-time change as a minute-of-day patch and say it was saved', async () => {
    const fake = httpFake({ 'PATCH /api/v1/account': () => ({ body: account({ scheduleStartMin: 420 }) }) });

    const result = await (await provider()).dispatchCommand({ type: 'day.set', patch: { wakeTime: '07:00' } });
    expect(result.status).toBe('applied');
    expect(fake.calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v1/account', body: { scheduleStartMin: 420 } });
  });

  it('should tell the owner a timezone change is staged for the next rollover', async () => {
    httpFake({ 'PATCH /api/v1/account': () => ({ body: account({ pendingTimezone: 'Europe/Lisbon' }) }) });

    const result = await (await provider()).dispatchCommand({ type: 'day.set', patch: { timezone: 'Europe/Lisbon' } });
    expect(result.message).toContain('next daily rollover');
  });

  it('should surface a refusal in the server’s own words', async () => {
    httpFake({ 'PATCH /api/v1/account': () => ({ status: 400, body: { code: 'ACC_001', type: 'BadRequest', message: 'defaultCurrency is immutable' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'day.set', patch: { timezone: 'Nowhere/Nowhere' } });
    expect(result).toMatchObject({ status: 'rejected', message: 'defaultCurrency is immutable' });
  });

  it('should patch one notification category without touching the others', async () => {
    const fake = httpFake({ 'PATCH /api/v1/account': () => ({ body: account() }) });

    await (await provider()).dispatchCommand({ type: 'notification.set', preferenceId: 'weeklyDigest', enabled: true });
    expect(fake.calls.at(-1)?.body).toEqual({ notificationPrefs: { weeklyDigest: true } });
  });
});

describe('Onboarding over the wire', () => {
  it('should report an un-onboarded account as incomplete', async () => {
    httpFake({ 'GET /api/v1/account': () => ({ body: account({ onboardingCompletedAt: null }) }) });
    expect(await (await provider()).getOnboarding()).toEqual({ completed: false });
  });

  it('should post the currency and wake window and lock the currency', async () => {
    const fake = httpFake({ 'POST /api/v1/account/onboarding': () => ({ body: account({ defaultCurrency: 'NOK' }) }) });

    const result = await (
      await provider()
    ).dispatchCommand({
      type: 'onboarding.complete',
      submission: { currency: 'NOK', timezone: 'Europe/Oslo', wakeTime: '06:30', sleepTime: '22:30' },
    });

    expect(result.status).toBe('applied');
    expect(fake.calls.at(-1)?.body).toEqual({ defaultCurrency: 'NOK', timezone: 'Europe/Oslo', scheduleStartMin: 390, scheduleEndMin: 1350 });
  });
});

describe('Data export over the wire', () => {
  it('should request an archive and then poll it to a downloadable link', async () => {
    httpFake({
      'POST /api/v1/account/export': () => ({ status: 201, body: { id: 'job-1', status: 'pending', requestedAt: '2026-08-24T09:00:00.000Z' } }),
      'GET /api/v1/account/export/job-1': (_call, attempt) =>
        attempt === 0
          ? { body: { id: 'job-1', status: 'running', requestedAt: '2026-08-24T09:00:00.000Z' } }
          : { body: { id: 'job-1', status: 'done', requestedAt: '2026-08-24T09:00:00.000Z', downloadUrl: 'https://storage.test/archive.zip' } },
    });

    const account_ = await provider();
    expect((await account_.getExport()).job.stage).toBe('idle');

    await account_.dispatchCommand({ type: 'export.prepare' });
    expect((await account_.getExport()).job.stage).toBe('preparing');

    const ready = await account_.getExport();
    expect(ready.job).toMatchObject({ stage: 'ready', downloadUrl: 'https://storage.test/archive.zip' });
  });

  it('should describe what the archive covers from the mirrored rows rather than from a guess', async () => {
    httpFake({});
    const view = await (await provider({ quests: [{ id: '1' }, { id: '2' }], journal_entries: [{ id: '9' }] })).getExport();

    expect(view.sets.find(set => set.name === 'Quests and history')?.meta).toContain('2 quests');
    expect(view.sets.find(set => set.name === 'Journal')?.meta).toBe('1 entry');
  });

  it('should refuse a second archive in the server’s own words', async () => {
    httpFake({
      'POST /api/v1/account/export': () => ({ status: 409, body: { code: 'EXP_002', type: 'Conflict', message: 'Export request limit reached for today; try again later' } }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'export.prepare' });
    expect(result).toMatchObject({ status: 'rejected', message: 'Export request limit reached for today; try again later' });
  });
});

describe('Account deletion over the wire', () => {
  const acknowledgeBoth = async (subject: SyncedAccountProvider): Promise<void> => {
    const view = await subject.getDeletion();
    for (const item of view.acknowledgements) await subject.dispatchCommand({ type: 'deletion.acknowledge', acknowledgementId: item.id, acknowledged: true });
  };

  it('should stop at the elevation boundary without deleting anything', async () => {
    const fake = httpFake({
      'GET /api/v1/account/deletion': () => ({ status: 403, body: { code: 'IAM_003', type: 'Forbidden', message: 'Step-up authentication required' } }),
      'POST /api/v1/account/deletion': () => ({ status: 403, body: { code: 'IAM_003', type: 'Forbidden', message: 'Step-up authentication required' } }),
    });

    const subject = await provider();
    await acknowledgeBoth(subject);

    const result = await subject.dispatchCommand({ type: 'deletion.begin' });
    expect(result.status).toBe('applied');
    expect(result.message).toContain('Nothing is scheduled yet');

    const view = await subject.getDeletion();
    expect(view.stage).toBe('awaiting-reauth');
    expect(view.reauth.continueTo).toContain('/api/auth/step-up?return_to=');
    expect(fake.calls.filter(call => call.method === 'POST' && call.path === '/api/v1/account/deletion')).toHaveLength(1);
  });

  it('should keep the deletion inert until both statements are acknowledged', async () => {
    const fake = httpFake({});

    const result = await (await provider()).dispatchCommand({ type: 'deletion.begin' });
    expect(result.status).toBe('rejected');
    expect(fake.calls).toHaveLength(0);
  });

  it('should report an erasure already in flight', async () => {
    httpFake({ 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'blobs_deleted' } }) });

    const view = await (await provider()).getDeletion();
    expect(view.stage).toBe('scheduled');
    expect(view.stateNote).toContain('blobs deleted');
  });
});

describe('Billing over the wire', () => {
  it('should open a checkout session for the chosen period', async () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/settings/billing', assign: vi.fn() }, writable: true, configurable: true });
    const fake = httpFake({ 'POST /api/v1/billing/checkout': () => ({ body: { url: 'https://pay.test/session', expiresAt: '2026-08-24T10:00:00.000Z' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'billing.checkout', plan: 'yearly' });
    expect(result.status).toBe('applied');
    expect(fake.calls.at(-1)?.body).toEqual({ plan: 'yearly' });
  });

  it('should read the plan from the mirrored entitlement rather than from the checkout call', async () => {
    httpFake({});
    const billing = await (await provider({ entitlement: [{ tier: 'paid', state: 'active', expiresAt: '2026-09-23T00:00:00.000Z', trialUsed: true }] })).getBilling();

    expect(billing.plans.find(plan => plan.id === 'coach')?.current).toBe(true);
    expect(billing.status).toContain('2026-09-23');
    expect(billing.trialLine).toContain('has been used');
  });
});

describe('Devices over the wire', () => {
  it('should list the registered devices and mark the one in use', async () => {
    httpFake({});
    const { engine } = createTestEngine({
      pages: [page({ devices: [{ id: 'device-a', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/1', lastSeenAt: '2026-08-24T08:00:00.000Z' }] })],
    });
    await engine.start();

    const view = await new SyncedAccountProvider(engine).getAppSync();
    expect(view.devices).toHaveLength(1);
    expect(view.devices[0]).toMatchObject({ name: 'Chrome · Macintosh', meta: 'Last seen 2026-08-24' });
  });
});
