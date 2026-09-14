import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@shadow-library/ui';

import { accountApi, type AccountResponseDto } from '@/lib/apis';
import {
  DELETION_ACCOUNT_UNCONFIRMED,
  DELETION_DEVICE_ERROR,
  DELETION_START_UNCONFIRMED,
  DELETION_START_UNCONFIRMED_CODE,
  DELETION_STARTED,
  DELETION_UNACKNOWLEDGED,
  DELETION_UNEXPECTED,
  DELETION_WRONG_ACCOUNT,
} from '@/lib/data';
import { type DeltaPage, type KeyValueBacking, MissingSessionProbeError, SYNC_META_KEYS, SyncedAccountProvider } from '@/lib/sync';

import { httpFake } from './http-fake';
import { withTimeZone } from './setup';
import { createTestEngine, sharedBacking, sharedMarker } from './sync-harness';

const TODAY = '2026-08-24';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it('should surface a refusal in owner copy rather than the server’s message', async () => {
    httpFake({
      'PATCH /api/v1/account': () => ({
        status: 400,
        body: { code: 'ACC_004', type: 'BadRequest', message: "Field 'defaultCurrency' is immutable and cannot be changed via PATCH" },
      }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'day.set', patch: { timezone: 'Nowhere/Nowhere' } });
    expect(result).toEqual({ status: 'rejected', message: 'That setting can’t be changed.', error: { code: 'ACC_004', kind: 'refusal' } });
  });

  it('should fall back to the screen’s own copy for an unknown code', async () => {
    httpFake({ 'PATCH /api/v1/account': () => ({ status: 500, body: { code: 'S999', type: 'Internal', message: 'Unknown Error' } }) });

    const result = await (await provider()).dispatchCommand({ type: 'day.set', patch: { timezone: 'Europe/Lisbon' } });
    expect(result).toEqual({ status: 'rejected', message: 'That setting could not be saved.', error: { code: 'S999', kind: 'unavailable' } });
  });

  it('should send the monthly budget in the account patch', async () => {
    const fake = httpFake({ 'PATCH /api/v1/account': call => ({ body: account({ monthlyBudgetMinor: call.body?.['monthlyBudgetMinor'] as number | null }) }) });

    const stored = await accountApi.patch({ monthlyBudgetMinor: 160000 });
    expect(fake.calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/api/v1/account', body: { monthlyBudgetMinor: 160000 } });
    expect(stored.monthlyBudgetMinor).toBe(160000);

    const cleared = await accountApi.patch({ monthlyBudgetMinor: null });
    expect(fake.calls.at(-1)?.body).toEqual({ monthlyBudgetMinor: null });
    expect(cleared.monthlyBudgetMinor).toBeNull();
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

  it('should refuse a second archive in owner copy', async () => {
    httpFake({
      'POST /api/v1/account/export': () => ({ status: 409, body: { code: 'EXP_002', type: 'Conflict', message: 'Export request limit reached for today; try again later' } }),
    });

    const result = await (await provider()).dispatchCommand({ type: 'export.prepare' });
    expect(result).toMatchObject({ status: 'rejected', message: 'You’ve already asked for an export today. Try again tomorrow.', error: { code: 'EXP_002', kind: 'refusal' } });
  });

  it('should describe a ready archive by when it was prepared rather than repeating its own badge', () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({
        'GET /api/v1/account/export/job-1': () => ({
          body: {
            id: 'job-1',
            status: 'done',
            requestedAt: '2026-08-24T09:00:00.000Z',
            completedAt: '2026-08-24T09:02:00.000Z',
            expiresAt: '2026-08-31T09:02:00.000Z',
            downloadUrl: 'https://storage.test/archive.zip',
          },
        }),
      });
      const { engine, store } = createTestEngine({ pages: [page({})], today: TODAY });
      await store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-1');
      await engine.start();

      const view = await new SyncedAccountProvider(engine).getExport();
      expect(view.job.when).toBe('Prepared 24 Aug 2026 · the link expires 31 Aug 2026');
    }));

  it('should not clobber a newer export saved by another tab while marking an old one expired', async () => {
    const { engine, store } = createTestEngine({ pages: [page({})], today: TODAY });
    await store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-1');
    await engine.start();

    httpFake({
      'GET /api/v1/account/export/job-1': async () => {
        await store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-2');
        return { status: 404, body: { code: 'EXP_001', type: 'NotFound', message: 'gone' } };
      },
      'GET /api/v1/account/export/job-2': () => ({ body: { id: 'job-2', status: 'pending', requestedAt: '2026-08-24T09:05:00.000Z' } }),
    });

    const view = await new SyncedAccountProvider(engine).getExport();
    expect(view.job.stage).toBe('preparing');
    expect(view.notice).toBeNull();
    expect(await store.readMeta(SYNC_META_KEYS.exportJobId)).toBe('job-2');
  });

  it('should note an expired export instead of silently pretending nothing was ever prepared', async () => {
    httpFake({ 'GET /api/v1/account/export/job-1': () => ({ status: 404, body: { code: 'EXP_001', type: 'NotFound', message: 'gone' } }) });
    const { engine, store } = createTestEngine({ pages: [page({})], today: TODAY });
    await store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-1');
    await engine.start();

    const view = await new SyncedAccountProvider(engine).getExport();
    expect(view.job.stage).toBe('idle');
    expect(view.notice).toBe('That export expired — prepare a new one.');
  });
});

describe('Account deletion over the wire', () => {
  const STEP_UP = { status: 403, body: { code: 'IAM_003', type: 'Forbidden', message: 'Step-up authentication required' } };

  const acknowledgeBoth = async (subject: SyncedAccountProvider): Promise<void> => {
    const view = await subject.getDeletion();
    for (const item of view.acknowledgements) await subject.dispatchCommand({ type: 'deletion.acknowledge', acknowledgementId: item.id, acknowledged: true });
  };

  it('should stop at the elevation boundary without asking to delete anything', async () => {
    const fake = httpFake({ 'GET /api/v1/account/deletion': () => STEP_UP });

    const subject = await provider();
    await acknowledgeBoth(subject);
    expect(await subject.dispatchCommand({ type: 'deletion.continue' })).toMatchObject({ status: 'applied' });

    const view = await subject.getDeletion();
    expect(view.stage).toEqual({ kind: 'awaiting-reauth', reason: 'step-up' });
    expect(view.reauth.continueTo).toBe('/api/auth/step-up?return_to=%2Fsettings%2Fdelete');
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should keep the deletion inert until both statements are acknowledged', async () => {
    const fake = httpFake({});
    const subject = await provider();

    expect(await subject.dispatchCommand({ type: 'deletion.continue' })).toMatchObject({ status: 'rejected' });
    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected' });
    expect(fake.calls).toHaveLength(0);
  });

  it('should only start the erasure from the confirmation step', async () => {
    const fake = httpFake({ 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }) });
    const subject = await provider();
    await acknowledgeBoth(subject);

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected' });
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should send one deletion request for starts that overlap', async () => {
    let state = 'none';
    const fake = httpFake({
      'GET /api/v1/account/deletion': () => ({ body: { deletionState: state } }),
      'POST /api/v1/account/deletion': () => ((state = 'pending'), { status: 202, body: { deletionState: 'pending' } }),
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });

    const results = await Promise.all([subject.dispatchCommand({ type: 'deletion.begin' }), subject.dispatchCommand({ type: 'deletion.begin' })]);
    expect(results.map(result => result.status)).toEqual(['applied', 'applied']);
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(1);
  });

  it('should hand back to the step-up when the elevation expired before the start', async () => {
    let elevated = true;
    httpFake({
      'GET /api/v1/account/deletion': () => (elevated ? { body: { deletionState: 'none' } } : STEP_UP),
      'POST /api/v1/account/deletion': () => STEP_UP,
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });
    expect((await subject.getDeletion()).stage).toEqual({ kind: 'confirm' });

    elevated = false;
    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'applied', message: '' });
    expect((await subject.getDeletion()).stage).toEqual({ kind: 'awaiting-reauth', reason: 'expired' });
  });

  it('should treat a signed-out answer to the start as a possible erasure', async () => {
    const signedOut = { status: 401, body: { code: 'IAM_001', type: 'Unauthorized', message: 'no session' } };
    let sent = false;
    httpFake({
      'GET /api/v1/account/deletion': () => (sent ? signedOut : { body: { deletionState: 'none' } }),
      'POST /api/v1/account/deletion': () => ((sent = true), signedOut),
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', error: { code: DELETION_START_UNCONFIRMED_CODE } });
    expect((await subject.getDeletion()).stage).toEqual({ kind: 'unconfirmed', reason: 'signed-out' });
  });

  it('should read the status back when the start gets no answer', async () => {
    let state = 'none';
    httpFake({
      'GET /api/v1/account/deletion': () => ({ body: { deletionState: state } }),
      'POST /api/v1/account/deletion': () => {
        state = 'pending';
        throw new TypeError('Failed to fetch');
      },
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'applied', message: DELETION_STARTED, erasure: { device: 'kept' } });
  });

  it('should not call a timed-out start not started when the status still reads none', async () => {
    const gatewayAnswers = [
      { status: 504, body: { code: 'API_REQUEST_TIMEOUT', type: 'GatewayTimeout', message: 'timed out' } },
      { status: 503, body: { code: 'UPSTREAM_RESET', type: 'ServiceUnavailable', message: 'upstream reset' } },
    ];
    for (const answer of gatewayAnswers) {
      const fake = httpFake({
        'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }),
        'POST /api/v1/account/deletion': () => answer,
      });
      const subject = await provider();
      await acknowledgeBoth(subject);
      await subject.dispatchCommand({ type: 'deletion.continue' });

      expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', error: { code: DELETION_START_UNCONFIRMED_CODE } });
      expect(fake.count('POST', '/api/v1/account/deletion')).toBe(1);
      vi.unstubAllGlobals();
    }
  });

  it('should say a start the server refused with an error did not start', async () => {
    httpFake({
      'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }),
      'POST /api/v1/account/deletion': () => ({ status: 500, body: { code: 'S999', type: 'InternalServerError', message: 'boom' } }),
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: 'The erasure could not be started.' });
  });

  it('should say the start is unconfirmed when neither the start nor the status answers', async () => {
    let reachable = true;
    httpFake({
      'GET /api/v1/account/deletion': () => {
        if (!reachable) throw new TypeError('Failed to fetch');
        return { body: { deletionState: 'none' } };
      },
      'POST /api/v1/account/deletion': () => {
        reachable = false;
        throw new TypeError('Failed to fetch');
      },
    });
    const subject = await provider();
    await acknowledgeBoth(subject);
    await subject.dispatchCommand({ type: 'deletion.continue' });

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: DELETION_START_UNCONFIRMED });
    expect((await subject.getDeletion()).stage).toEqual({ kind: 'unconfirmed', reason: 'unreachable' });

    reachable = true;
    expect((await subject.getDeletion()).stage).toEqual({ kind: 'confirm' });
  });

  it('should show an erasure under way when a device that never pulled it is refused the account', async () => {
    httpFake({
      'GET /api/v1/account/deletion': () => STEP_UP,
      'GET /api/v1/account': () => ({ status: 403, body: { code: 'ACC_002', type: 'Forbidden', message: 'being deleted' } }),
    });

    expect((await (await provider()).getDeletion()).stage).toMatchObject({ kind: 'underway', progress: 'unknown' });
  });

  it('should drop acknowledgements that are more than an hour old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-24T09:00:00.000Z'));
    try {
      httpFake({ 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }) });
      const subject = await provider();
      await acknowledgeBoth(subject);
      await subject.dispatchCommand({ type: 'deletion.continue' });
      expect((await subject.getDeletion()).stage).toEqual({ kind: 'confirm' });

      vi.setSystemTime(new Date('2026-08-24T09:59:00.000Z'));
      expect((await subject.getDeletion()).acknowledged).toHaveLength(2);

      vi.setSystemTime(new Date('2026-08-24T10:01:00.000Z'));
      const stale = await subject.getDeletion();
      expect(stale).toMatchObject({ stage: { kind: 'idle' }, acknowledged: [] });
      expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: DELETION_UNACKNOWLEDGED });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should answer in owner copy when the saved deletion steps cannot be read', async () => {
    let broken = false;
    const backing = sharedBacking();
    const failing: KeyValueBacking = { ...backing, get: key => (broken ? Promise.reject(new Error('quota')) : backing.get(key)) };
    const fake = httpFake({ 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }) });
    const { engine } = createTestEngine({ today: TODAY, backing: failing });
    const subject = new SyncedAccountProvider(engine);

    broken = true;
    expect(await subject.dispatchCommand({ type: 'deletion.continue' })).toMatchObject({ status: 'rejected', message: DELETION_DEVICE_ERROR });
    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: DELETION_DEVICE_ERROR });
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should report an erasure already in flight', async () => {
    httpFake({ 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'blobs_deleted' } }) });

    const view = await (await provider()).getDeletion();
    expect(view.stage).toEqual({ kind: 'underway', progress: 'blobs_deleted', startedAt: null });
  });

  it('should read an erasure in progress rather than the form when the account is refused', async () => {
    httpFake({ 'GET /api/v1/account/deletion': () => ({ status: 403, body: { code: 'ACC_002', type: 'Forbidden', message: 'being deleted' } }) });

    const view = await (await provider()).getDeletion();
    expect(view.stage).toMatchObject({ kind: 'underway', progress: 'unknown' });
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

  it('should read the plan from the mirrored entitlement rather than from the checkout call', async () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({});
      const billing = await (await provider({ entitlement: [{ tier: 'paid', state: 'active', expiresAt: '2026-09-23T00:00:00.000Z', trialUsed: true }] })).getBilling();

      expect(billing.plans.find(plan => plan.id === 'coach')?.current).toBe(true);
      expect(billing.status).toBe('Coach · Active until 23 Sep 2026');
      expect(billing.trialLine).toContain('has been used');
    }));

  it('should not advertise a trial that has no way to start', async () => {
    httpFake({});
    const billing = await (await provider({ entitlement: [{ tier: 'free', state: 'free', trialUsed: false }] })).getBilling();
    expect(billing.trialLine).toBe('');
  });

  it('should describe a lapsed subscriber instead of a never-paid free user', async () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({});
      const billing = await (await provider({ entitlement: [{ tier: 'free', state: 'lapsed', expiresAt: '2026-09-04T00:00:00.000Z', trialUsed: true }] })).getBilling();

      expect(billing.status).toBe('Coach ended on 4 Sep 2026');
      expect(billing.lapsed).toBe(true);
      expect(billing.plans.find(plan => plan.id === 'free')?.current).toBe(true);
    }));

  it('should say Free rather than assert a payment method it cannot know', async () => {
    httpFake({});
    const billing = await (await provider({ entitlement: [{ tier: 'free', state: 'free', trialUsed: false }] })).getBilling();
    expect(billing.status).toBe('Free');
    expect(billing.lapsed).toBe(false);
  });
});

describe('Failed changes', () => {
  it('should refuse to dismiss a failed change once the store has closed rather than reject', async () => {
    httpFake({});
    const { engine } = createTestEngine();
    await engine.start();
    engine.stop();

    const result = await new SyncedAccountProvider(engine).dispatchCommand({ type: 'failedChange.dismiss', commandId: 'gone' });

    expect(result).toMatchObject({ status: 'applied', delivery: { status: 'refused', boundary: 'closed' } });
  });
});

describe('Devices over the wire', () => {
  it('should list the registered devices and mark the one in use', async () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({});
      const { engine } = createTestEngine({
        pages: [page({ devices: [{ id: 'device-a', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/1', lastSeenAt: '2026-08-24T08:00:00.000Z' }] })],
      });
      await engine.start();

      const view = await new SyncedAccountProvider(engine).getAppSync();
      expect(view.devices).toHaveLength(1);
      expect(view.devices[0]).toMatchObject({ name: 'Chrome · Macintosh', meta: 'Last seen 24 Aug 2026 at 10:00' });
    }));
});

describe('Account deletion against the signed-in session', () => {
  const ELEVATED = { 'GET /api/v1/account/deletion': () => ({ body: { deletionState: 'none' } }) };

  const confirmedProvider = async (principal?: () => Promise<string>, backing: KeyValueBacking = sharedBacking()): Promise<SyncedAccountProvider> => {
    const { engine, store } = createTestEngine({ today: TODAY, accountId: 'account-a', marker: sharedMarker(), backing });
    store.open();
    const subject = new SyncedAccountProvider(engine, principal);
    for (const item of (await subject.getDeletion()).acknowledgements) {
      await subject.dispatchCommand({ type: 'deletion.acknowledge', acknowledgementId: item.id, acknowledged: true });
    }
    await subject.dispatchCommand({ type: 'deletion.continue' });
    return subject;
  };

  const START = { 'POST /api/v1/account/deletion': () => ({ status: 202, body: { deletionState: 'pending' } }) };
  const SELF = (): Promise<string> => Promise.resolve('account-a');

  it('should report that this device’s copy was removed once the erasure starts', async () => {
    const backing = sharedBacking();
    httpFake({ ...ELEVATED, ...START });
    const subject = await confirmedProvider(SELF, backing);

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'applied', erasure: { device: 'removed' } });
    expect((await backing.keys()).filter(key => key.startsWith('acct:account-a:') && !key.endsWith(':meta:device-id'))).toEqual([]);
  });

  it('should report that this device’s copy was kept when the wipe fails', async () => {
    const backing = sharedBacking();
    let failing = false;
    httpFake({ ...ELEVATED, 'POST /api/v1/account/deletion': () => ((failing = true), { status: 202, body: { deletionState: 'pending' } }) });
    const subject = await confirmedProvider(SELF, { ...backing, delete: key => (failing ? Promise.reject(new Error('blocked')) : backing.delete(key)) });

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'applied', erasure: { device: 'kept' } });
  });

  it('should refuse to start the erasure when the session belongs to another account', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const fake = httpFake(ELEVATED);
    const subject = await confirmedProvider(() => Promise.resolve('account-b'));

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ delivery: { status: 'refused', boundary: 'principal-changed' } });
    expect(warning).toHaveBeenCalledWith(DELETION_WRONG_ACCOUNT);
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should answer in owner copy when the local store has been closed', async () => {
    const fake = httpFake(ELEVATED);
    const { engine, store } = createTestEngine({ today: TODAY, accountId: 'account-a', marker: sharedMarker() });
    store.open();
    const subject = new SyncedAccountProvider(engine, SELF);
    store.close();

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: DELETION_UNEXPECTED });
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should not start the erasure when the account check fails', async () => {
    const fake = httpFake(ELEVATED);
    const subject = await confirmedProvider(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await subject.dispatchCommand({ type: 'deletion.begin' })).toMatchObject({ status: 'rejected', message: DELETION_ACCOUNT_UNCONFIRMED });
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });

  it('should refuse to start the erasure from an account store with no session probe', async () => {
    const fake = httpFake(ELEVATED);
    const subject = await confirmedProvider();

    await expect(subject.dispatchCommand({ type: 'deletion.begin' })).rejects.toBeInstanceOf(MissingSessionProbeError);
    expect(fake.count('POST', '/api/v1/account/deletion')).toBe(0);
  });
});
