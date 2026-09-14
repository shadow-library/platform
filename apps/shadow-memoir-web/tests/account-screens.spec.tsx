import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@shadow-library/ui';

import { OnboardingScreen } from '@/features/onboarding';
import { AppSyncScreen, BillingScreen, DeleteAccountScreen, ExportScreen, NotificationSettingsScreen, SettingsScreen } from '@/features/settings';
import { type DeltaPage, SYNC_META_KEYS, SyncEngineProvider } from '@/lib/sync';
import { OnboardingGate } from '@/routes/_app';

import { createMemoirTestData, renderScreen } from './harness';
import { type HttpFake, httpFake } from './http-fake';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, failed, type FakeServer, type TestEngine, type TestEngineOptions } from './sync-harness';

const TODAY = '2026-08-22';

interface AccountServerState {
  scheduleStartMin: number;
  scheduleEndMin: number;
  timezone: string;
  pendingTimezone: string | null;
  intensityMode: string;
  pendingIntensityMode: string | null;
  defaultCurrency: string;
  onboardingCompletedAt: string | null;
  monthlyBudgetMinor: number | null;
  notificationPrefs: { weeklyDigest: boolean; aiReadiness: boolean; billingReminders: boolean };
}

const ACCOUNT_PATH = '/api/v1/account';

/** Stubs `GET/PATCH /api/v1/account` and `GET /api/auth/userinfo` on the global fetch `SyncedAccountProvider` sends through — separate from the sync engine's own `FakeServer`. */
function accountServer(
  overrides: Partial<AccountServerState> = {},
  options: { status?: () => number; errorCode?: string; patchGate?: () => Promise<void> } = {},
): { fake: HttpFake; state: AccountServerState } {
  const state: AccountServerState = {
    scheduleStartMin: 6 * 60 + 30,
    scheduleEndMin: 22 * 60 + 30,
    timezone: 'Europe/Oslo',
    pendingTimezone: null,
    intensityMode: 'standard',
    pendingIntensityMode: null,
    defaultCurrency: 'EUR',
    onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
    monthlyBudgetMinor: null,
    notificationPrefs: { weeklyDigest: false, aiReadiness: false, billingReminders: false },
    ...overrides,
  };

  const guarded = (reply: () => { status?: number; body: unknown }): { status?: number; body: unknown } => {
    const status = options.status?.();
    if (status && status !== 200) return { status, body: { code: options.errorCode, message: 'no' } };
    return reply();
  };

  const fake = httpFake({
    'GET /api/auth/userinfo': () => ({ body: { sub: 'account-a', email: 'owner@memoir.test' } }),
    [`GET ${ACCOUNT_PATH}`]: () => guarded(() => ({ body: state })),
    [`PATCH ${ACCOUNT_PATH}`]: async call => {
      await options.patchGate?.();
      return guarded(() => {
        const patch = call.body as Partial<AccountServerState> & { notificationPrefs?: Partial<AccountServerState['notificationPrefs']> };
        const { timezone, intensityMode, notificationPrefs, ...rest } = patch;
        Object.assign(state, rest);
        if (notificationPrefs) Object.assign(state.notificationPrefs, notificationPrefs);
        if (timezone !== undefined) state.pendingTimezone = timezone;
        if (intensityMode !== undefined) state.pendingIntensityMode = intensityMode;
        return { body: state };
      });
    },
  });

  return { fake, state };
}

function renderSyncedSettings(node: ReactNode, engineOptions: TestEngineOptions = {}): TestEngine {
  const test = createTestEngine({ today: TODAY, ...engineOptions });
  const data = createSyncedTestData(test.engine);
  renderScreen(<SyncEngineProvider data={data}>{node}</SyncEngineProvider>, { value: data });
  return test;
}

function page(domains: DeltaPage['domains']): DeltaPage {
  return { cursor: '1', hasMore: false, domains, tombstones: [] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Settings screen', () => {
  it('should render the day, appearance and data sections', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(await screen.findByText('Day and money')).toBeDefined();
    expect(screen.getByText('Appearance and behaviour')).toBeDefined();
    expect(screen.getByText('Data and privacy')).toBeDefined();
  });

  it('should show the home currency read-only', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    const currency = (await screen.findByLabelText('Home currency')) as HTMLInputElement;
    expect(currency.readOnly).toBe(true);
    expect(currency.disabled).toBe(false);
    expect(currency.value).toContain('EUR');
    expect(await screen.findByText(/Fixed when you set up/)).toBeDefined();
  });

  it('should not render behaviour switches', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.queryByText('Compact density')).toBeNull();
    expect(screen.queryByText('Reduce motion')).toBeNull();
    expect(screen.queryByText('Daily journal prompt')).toBeNull();
    expect(screen.queryByText('Show coins and cosmetics')).toBeNull();
  });

  it('should show a field error for an invalid sleep time', async () => {
    const user = userEvent.setup();
    renderScreen(<SettingsScreen />, { today: TODAY });
    const sleep = (await screen.findByRole('combobox', { name: 'Sleep time' })) as HTMLInputElement;
    expect(sleep.value).toBe('22:30');

    await user.clear(sleep);
    await user.type(sleep, '0500');
    await user.tab();

    expect(await screen.findByText(/Sleep time must be later than wake time/)).toBeDefined();
    const revertedSleep = (await screen.findByRole('combobox', { name: 'Sleep time' })) as HTMLInputElement;
    expect(revertedSleep.value).toBe('22:30');
  });
});

describe('Settings screen, synced', () => {
  it('should include the saved time zone in the list', async () => {
    const user = userEvent.setup();
    accountServer({ timezone: 'America/Argentina/ComodRivadavia' });
    renderSyncedSettings(<SettingsScreen />);

    const trigger = await screen.findByLabelText('Timezone');
    await user.click(trigger);

    expect(await screen.findByRole('option', { name: 'America/Argentina/ComodRivadavia' })).toBeDefined();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(4);
  });

  it('should save and clear the monthly budget', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success');
    const { state } = accountServer({ monthlyBudgetMinor: null });
    renderSyncedSettings(<SettingsScreen />);

    const budget = (await screen.findByLabelText('Monthly budget')) as HTMLInputElement;
    await user.type(budget, '1500{Enter}');
    await waitFor(() => expect(success).toHaveBeenCalledWith('Saved.', undefined));
    expect(state.monthlyBudgetMinor).toBe(150_000);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Cleared. No monthly budget is set.', undefined));
    expect(state.monthlyBudgetMinor).toBeNull();
    expect(budget.value).toBe('');
  });

  it('should not save a typed amount when Clear is clicked before it commits', async () => {
    const user = userEvent.setup();
    const { state } = accountServer({ monthlyBudgetMinor: null });
    renderSyncedSettings(<SettingsScreen />);

    const budget = (await screen.findByLabelText('Monthly budget')) as HTMLInputElement;
    await user.type(budget, '900');
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(budget.value).toBe(''));
    expect(state.monthlyBudgetMinor).toBeNull();
  });

  it('should not commit a draft when Tab moves focus to Clear', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success');
    const { state } = accountServer({ monthlyBudgetMinor: null });
    renderSyncedSettings(<SettingsScreen />);

    const budget = (await screen.findByLabelText('Monthly budget')) as HTMLInputElement;
    await user.type(budget, '700');
    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear' }));
    expect(success).not.toHaveBeenCalled();
    expect(state.monthlyBudgetMinor).toBeNull();
  });

  it('should not toast when saving an unchanged value', async () => {
    const user = userEvent.setup();
    const success = vi.spyOn(toast, 'success');
    const neutral = vi.spyOn(toast, 'neutral');
    accountServer({ intensityMode: 'standard', pendingIntensityMode: 'low_intensity' });
    renderSyncedSettings(<SettingsScreen />);

    const intensity = await screen.findByLabelText('Intensity');
    await screen.findByText('Gentle from your next rollover — Standard stays active today.');
    await user.click(intensity);
    await user.click(await screen.findByRole('option', { name: 'Standard' }));

    await waitFor(() => expect(screen.queryByText(/from your next rollover/)).toBeNull());
    expect(success).not.toHaveBeenCalled();
    expect(neutral).not.toHaveBeenCalled();
  });

  it('should show a deletion notice instead of a skeleton', async () => {
    accountServer({}, { status: () => 403, errorCode: 'ACC_002' });
    renderSyncedSettings(<SettingsScreen />);
    expect(await screen.findByText('This account is being deleted')).toBeDefined();
  });
});

describe('Notification preferences', () => {
  it('should ship every category off', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeDefined();

    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBe(4);
    for (const control of switches) expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('should turn one category on without touching the others', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('switch', { name: 'Weekly review by email' }));

    expect((await screen.findByRole('switch', { name: 'Weekly review by email' })).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Billing reminders by email' }).getAttribute('aria-checked')).toBe('false');
  });

  it('should promise never to notify about a missed quest', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    expect(await screen.findByText(/will not notify you about a missed quest/)).toBeDefined();
  });

  it('should show push as coming soon', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    const push = (await screen.findByRole('switch', { name: 'Push on this browser' })) as HTMLButtonElement;
    expect(push.disabled).toBe(true);
    expect(push.getAttribute('aria-checked')).toBe('false');
    expect(await screen.findByText('Push notifications are coming soon')).toBeDefined();
    expect(screen.getByText('Not available yet — email is the only channel for now.')).toBeDefined();
  });
});

describe('Notification preferences, synced', () => {
  it('should revert a notification switch when the save fails', async () => {
    const user = userEvent.setup();
    const danger = vi.spyOn(toast, 'danger');
    let fail = false;
    accountServer({}, { status: () => (fail ? 500 : 200), errorCode: 'S001' });
    renderSyncedSettings(<NotificationSettingsScreen />);

    const weeklyReview = await screen.findByRole('switch', { name: 'Weekly review by email' });
    expect(weeklyReview.getAttribute('aria-checked')).toBe('false');

    fail = true;
    await user.click(weeklyReview);

    await waitFor(() => expect(weeklyReview.getAttribute('aria-checked')).toBe('false'));
    expect(danger).toHaveBeenCalled();
  });

  it('should flip a switch optimistically while the PATCH is held, and send one PATCH on a double click', async () => {
    const user = userEvent.setup();
    let releaseGate = (): void => undefined;
    const gate = new Promise<void>(resolve => (releaseGate = resolve));
    const { fake } = accountServer({}, { patchGate: () => gate });
    renderSyncedSettings(<NotificationSettingsScreen />);

    const weeklyReview = await screen.findByRole('switch', { name: 'Weekly review by email' });
    expect(weeklyReview.getAttribute('aria-checked')).toBe('false');

    await user.click(weeklyReview);
    await user.click(weeklyReview);

    expect(weeklyReview.getAttribute('aria-checked')).toBe('true');
    expect(weeklyReview.getAttribute('data-pending')).toBe('true');

    releaseGate();
    await waitFor(() => expect(weeklyReview.getAttribute('data-pending')).toBeNull());
    expect(weeklyReview.getAttribute('aria-checked')).toBe('true');
    expect(fake.count('PATCH', ACCOUNT_PATH)).toBe(1);
  });
});

describe('Plan and billing', () => {
  it('should sell coaching volume and nothing about the game', async () => {
    renderScreen(<BillingScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Plan and billing' })).toBeDefined();
    expect(await screen.findByText('What money does not buy')).toBeDefined();
    expect(screen.getByText('No XP, HP, shields or cosmetics — not now, not later')).toBeDefined();
  });

  it('should send cancellation to the payment provider rather than pretending to own it', async () => {
    renderScreen(<BillingScreen />, { today: TODAY });
    expect(await screen.findByText(/no route that can write your plan/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cancel the plan' })).toBeNull();
  });

  it('should start one checkout on repeated clicks', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    let releaseGate = (): void => undefined;
    const gate = new Promise<void>(resolve => (releaseGate = resolve));
    const fake = httpFake({
      'POST /api/v1/billing/checkout': async () => {
        await gate;
        return { body: { url: 'https://pay.test/session', expiresAt: '2026-08-24T10:00:00.000Z' } };
      },
    });
    renderSyncedSettings(<BillingScreen />);

    const monthly = (await screen.findByRole('button', { name: 'Pay monthly' })) as HTMLButtonElement;
    fireEvent.click(monthly);
    fireEvent.click(monthly);

    const yearly = (await screen.findByRole('button', { name: 'Pay yearly' })) as HTMLButtonElement;
    await waitFor(() => expect(yearly.disabled).toBe(true));

    releaseGate();
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(fake.count('POST', '/api/v1/billing/checkout')).toBe(1);
  });

  it('should re-enable checkout when the page is restored after leaving for the provider', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    httpFake({ 'POST /api/v1/billing/checkout': () => ({ body: { url: 'https://pay.test/session', expiresAt: '2026-08-24T10:00:00.000Z' } }) });
    renderSyncedSettings(<BillingScreen />);

    const monthly = (await screen.findByRole('button', { name: 'Pay monthly' })) as HTMLButtonElement;
    fireEvent.click(monthly);
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(monthly.disabled).toBe(true));

    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    fireEvent(window, pageShow);

    await waitFor(() => expect(monthly.disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'Pay yearly' })).not.toHaveProperty('disabled', true);
  });

  it('should explain a failed checkout', async () => {
    const danger = vi.spyOn(toast, 'danger');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    httpFake({ 'POST /api/v1/billing/checkout': () => ({ status: 500, body: { code: 'S001', type: 'Internal', message: 'boom' } }) });
    renderSyncedSettings(<BillingScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pay monthly' }));
    await waitFor(() => expect(danger).toHaveBeenCalled());
    expect(danger.mock.calls.at(-1)?.[0]).toContain('start checkout');
    expect(assign).not.toHaveBeenCalled();
  });

  it('should not offer a second checkout to a Coach subscriber', async () => {
    const fake = httpFake({ 'POST /api/v1/billing/checkout': () => ({ body: { url: 'https://pay.test/session', expiresAt: '2026-08-24T10:00:00.000Z' } }) });
    renderSyncedSettings(<BillingScreen />, { pages: [page({ entitlement: [{ tier: 'paid', state: 'active', expiresAt: '2026-10-06T00:00:00.000Z', trialUsed: true }] })] });

    await screen.findByRole('heading', { name: 'Plan and billing' });
    expect(screen.queryByRole('button', { name: 'Pay monthly' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pay yearly' })).toBeNull();
    expect(screen.getByText(/done with the payment provider/)).toBeDefined();
    expect(fake.count('POST', '/api/v1/billing/checkout')).toBe(0);
  });

  it('should describe a lapsed subscription', () =>
    withTimeZone('Europe/Oslo', async () => {
      renderSyncedSettings(<BillingScreen />, { pages: [page({ entitlement: [{ tier: 'free', state: 'lapsed', expiresAt: '2026-09-04T00:00:00.000Z', trialUsed: true }] })] });
      expect(await screen.findByText('Coach ended on 4 Sep 2026')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Renew monthly' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Renew yearly' })).toBeDefined();
    }));

  it('should not advertise a trial without a way to start it', async () => {
    renderSyncedSettings(<BillingScreen />);
    await screen.findByRole('heading', { name: 'Plan and billing' });
    expect(screen.queryByText('Trial')).toBeNull();
    expect(screen.queryByText(/no card needed to start/)).toBeNull();
  });

  it('should show an error instead of a free plan when billing cannot load', async () => {
    renderSyncedSettings(<BillingScreen />, { status: () => 500, errorCode: 'S001' });
    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.queryByText('Free')).toBeNull();
  });

  it('should hide billing behind a deletion notice while erasure is under way', async () => {
    renderSyncedSettings(<BillingScreen />, { status: () => 403, errorCode: 'ACC_002' });
    expect(await screen.findByText('This account is being deleted')).toBeDefined();
    expect(screen.queryByText('Free')).toBeNull();
  });
});

describe('Data export', () => {
  it('should prepare an archive without changing anything', async () => {
    renderScreen(<ExportScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Data export' })).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare the export' }));
    expect(await screen.findByText('Preparing')).toBeDefined();
    expect(await screen.findByText(/You can leave this page/)).toBeDefined();
  });

  it('should explain the export daily limit', async () => {
    const warning = vi.spyOn(toast, 'warning');
    httpFake({
      'POST /api/v1/account/export': () => ({ status: 409, body: { code: 'EXP_002', type: 'Conflict', message: 'Export request limit reached for today; try again later' } }),
    });
    renderSyncedSettings(<ExportScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare the export' }));
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(warning.mock.calls.at(-1)?.[0]).toContain('already asked for an export today');
  });

  it('should explain an expired export job', () =>
    withTimeZone('Europe/Oslo', async () => {
      httpFake({ 'GET /api/v1/account/export/job-1': () => ({ status: 404, body: { code: 'EXP_001', type: 'NotFound', message: 'gone' } }) });
      const test = createTestEngine({ today: TODAY });
      await test.store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-1');
      const data = createSyncedTestData(test.engine);
      renderScreen(
        <SyncEngineProvider data={data}>
          <ExportScreen />
        </SyncEngineProvider>,
        { value: data },
      );

      expect(await screen.findByText('That export expired — prepare a new one.')).toBeDefined();
      expect(await screen.findByRole('button', { name: 'Prepare the export' })).toBeDefined();
    }));

  it('should hide export behind a deletion notice while erasure is under way', async () => {
    renderSyncedSettings(<ExportScreen />, { status: () => 403, errorCode: 'ACC_002' });
    expect(await screen.findByText('This account is being deleted')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Prepare the export' })).toBeNull();
  });
});

describe('Account deletion', () => {
  it('should keep the deletion inert until both statements are acknowledged', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Delete your data' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Continue to confirmation' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('should stop at the re-authentication boundary rather than scheduling anything', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });

    for (const box of await screen.findAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to confirmation' }));

    expect(await screen.findByText('Confirm it is you, on your Shadow account')).toBeDefined();
    expect(await screen.findByText(/nothing is erased before you give it/)).toBeDefined();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('should link each lighter option to the setting it stands for', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });
    expect(await screen.findByText('Pause instead')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Change intensity' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('link', { name: 'Export your data' }).getAttribute('href')).toBe('/settings/export');
    expect(screen.getByRole('link', { name: 'Notification settings' }).getAttribute('href')).toBe('/settings/notifications');
  });
});

describe('App and sync', () => {
  it('should show the queue, the devices and what still works offline', async () => {
    renderScreen(<AppSyncScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'App and sync' })).toBeDefined();
    expect(await screen.findByText('Expense €18.40 · Groceries')).toBeDefined();
    expect(screen.getByText('Chrome · MacBook')).toBeDefined();
    expect(screen.getByText('What works offline')).toBeDefined();
  });

  it('should have nothing waiting on a fresh account', async () => {
    renderScreen(<AppSyncScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByText('Nothing is waiting')).toBeDefined();
  });

  it('should confirm before removing a device', async () => {
    const data = createMemoirTestData({ today: TODAY });
    let release = (): void => undefined;
    const dispatch = vi.spyOn(data.account, 'dispatchCommand');
    dispatch.mockImplementation(
      () => new Promise(resolve => (release = () => resolve({ status: 'applied', message: 'Removed from your devices.', xpAwarded: 0, coinsAwarded: 0 }))),
    );
    const success = vi.spyOn(toast, 'success');
    renderScreen(<AppSyncScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Shadow Memoir · iPhone' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Remove “Shadow Memoir · iPhone”?');
    expect(dialog.textContent).not.toMatch(/notification/i);
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'device.remove', deviceId: 'd2' }));
    const pending = await screen.findByRole('button', { name: 'Remove Shadow Memoir · iPhone' });
    expect(pending.getAttribute('aria-busy')).toBe('true');

    release();
    await waitFor(() => expect(success).toHaveBeenCalledWith('Removed from your devices.', undefined));
    success.mockRestore();
  });

  it('should keep a device when the removal is cancelled', async () => {
    const data = createMemoirTestData({ today: TODAY });
    const dispatch = vi.spyOn(data.account, 'dispatchCommand');
    renderScreen(<AppSyncScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Remove Shadow Memoir · iPhone' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'device.remove' }));
  });
});

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

interface HeldPath {
  fetchImpl: (server: FakeServer) => typeof fetch;
  hold: () => void;
  release: () => void;
}

function held(path: string): HeldPath {
  let release = (): void => undefined;
  let gate: Promise<void> | null = null;
  const hold = (): void => void (gate = new Promise<void>(resolve => (release = resolve)));
  hold();
  const fetchImpl = (server: FakeServer): typeof fetch =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (gate && String(input).includes(path)) await gate;
      return server.fetchImpl(input, init);
    }) as typeof fetch;
  return {
    fetchImpl,
    hold,
    release: () => {
      gate = null;
      release();
    },
  };
}

function renderSyncedAppSync(options: TestEngineOptions = {}): ReturnType<typeof createTestEngine> {
  const test = createTestEngine({ today: TODAY, ...options });
  const data = createSyncedTestData(test.engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <AppSyncScreen />
    </SyncEngineProvider>,
    { value: data },
  );
  return test;
}

const DEVICE_PAGE: DeltaPage = {
  cursor: '1',
  hasMore: false,
  tombstones: [],
  domains: { devices: [{ id: 'd-1', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120', lastSeenAt: '2026-08-22T08:00:00.000Z' }] },
};

describe('App and sync, synced', () => {
  afterEach(() => setOnline(true));

  it('should say syncing during the first sync rather than synced with no devices', async () => {
    const gate = held('/sync/delta');
    renderSyncedAppSync({ fetchImpl: gate.fetchImpl, pages: [DEVICE_PAGE] });

    expect(await screen.findByRole('heading', { name: 'Syncing' })).toBeDefined();
    expect(screen.queryByText('Online and synced')).toBeNull();
    expect(screen.queryByText('No devices yet')).toBeNull();

    gate.release();
    expect(await screen.findByRole('heading', { name: 'Online and synced' })).toBeDefined();
    expect(await screen.findByText('Chrome · Macintosh')).toBeDefined();
  });

  it('should update App & sync status live', async () => {
    const { engine } = renderSyncedAppSync({ pages: [DEVICE_PAGE] });
    expect(await screen.findByRole('heading', { name: 'Online and synced' })).toBeDefined();

    setOnline(false);
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);

    expect(await screen.findByRole('heading', { name: 'Offline — working from this device' })).toBeDefined();
    expect(await screen.findByText('Queued changes: 1')).toBeDefined();
    expect(screen.getAllByText(/position \d/)).toHaveLength(1);
  });

  it('should keep the queued count equal to the listed rows and say signed out when the session is gone', async () => {
    let status = 200;
    const { engine } = renderSyncedAppSync({ status: () => status });
    expect(await screen.findByRole('heading', { name: 'Online and synced' })).toBeDefined();

    status = 401;
    for (const questId of ['a', 'b', 'c']) await engine.enqueue({ type: 'quest.complete', occurrenceId: `${questId}:${TODAY}` }, TODAY);

    expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeDefined();
    expect(await screen.findByText('Queued changes: 3')).toBeDefined();
    expect(screen.getAllByText(/position \d/)).toHaveLength(3);
    expect(screen.queryByText(/about two minutes/)).toBeNull();
  });

  it('should show pending feedback on Sync now and settle', async () => {
    const gate = held('/sync/delta');
    renderSyncedAppSync({ fetchImpl: gate.fetchImpl });
    gate.release();
    expect(await screen.findByRole('heading', { name: 'Online and synced' })).toBeDefined();

    gate.hold();
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    const busy = await screen.findByRole('button', { name: 'Syncing…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect((busy as HTMLButtonElement).disabled).toBe(true);

    gate.release();
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeDefined();
    expect(await screen.findByText(/^Last synced /)).toBeDefined();
  });

  it('should mark only the batch on the wire as sent', async () => {
    const gate = held('/sync/commands');
    setOnline(false);
    const { engine } = renderSyncedAppSync({ fetchImpl: gate.fetchImpl });
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `a:${TODAY}` }, TODAY);
    setOnline(true);

    void engine.sync();
    expect(await screen.findByText('Sent')).toBeDefined();
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `b:${TODAY}` }, TODAY);

    await waitFor(() => expect(screen.getAllByText(/position \d/)).toHaveLength(2));
    expect(screen.getAllByText('Sent')).toHaveLength(1);
    expect(screen.getAllByText('Queued')).toHaveLength(1);
    gate.release();
  });

  it('should not promise a retry for the head of a failed queue', async () => {
    setOnline(false);
    const { engine } = renderSyncedAppSync({ status: () => 500 });
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `a:${TODAY}` }, TODAY);
    setOnline(true);
    await engine.sync();

    expect(await screen.findByRole('heading', { name: 'Sync did not go through' })).toBeDefined();
    expect(await screen.findByText('Queued')).toBeDefined();
    expect(screen.queryByText('Retrying')).toBeNull();
  });

  it('should list a journal entry the server could not save with its text, and dismiss it', async () => {
    setOnline(false);
    const { engine } = renderSyncedAppSync({ outcomes: batch => batch.commandIds.map(id => failed(id, 'Validation Error', 'VALIDATION_ERROR')) });
    expect(await screen.findByRole('heading', { name: 'Offline — working from this device' })).toBeDefined();

    await engine.enqueue({ type: 'journal.save', draft: { date: TODAY, text: 'The walk home in the rain.\nWorth keeping.', mood: null } }, TODAY);
    setOnline(true);
    await engine.sync();

    expect(await screen.findByRole('heading', { name: 'Couldn’t sync' })).toBeDefined();
    expect(screen.getByText('Journal entry')).toBeDefined();
    expect(screen.getByText(/The walk home in the rain\.\s+Worth keeping\./)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Journal entry' }));
    expect(await screen.findByRole('alertdialog')).toBeDefined();
    expect(await engine.outbox.deadLetters()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Nothing else failed')).toBeDefined();
    expect(await engine.outbox.deadLetters()).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Couldn’t sync' })));
  });

  it('should dismiss a failed change without text at once and move focus to the next one', async () => {
    setOnline(false);
    const { engine } = renderSyncedAppSync({ outcomes: batch => batch.commandIds.map(id => failed(id, 'Anchor quests require a start time', 'QST_003')) });
    expect(await screen.findByRole('heading', { name: 'Offline — working from this device' })).toBeDefined();

    for (const questId of ['a', 'b']) await engine.enqueue({ type: 'quest.complete', occurrenceId: `${questId}:${TODAY}` }, TODAY);
    setOnline(true);
    await engine.sync();
    await waitFor(() => expect(screen.getAllByText('Quest completed')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss Quest completed' })[0] as HTMLElement);

    await waitFor(() => expect(screen.getAllByText('Quest completed')).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Quest completed'));
  });

  it('should ellipsize long device names and tell unnamed devices apart by when they were last seen', async () =>
    withTimeZone('Asia/Dubai', async () => {
      const agent = `Mozilla/5.0 CustomEmbeddedBrowser ${'x'.repeat(80)}`;
      renderSyncedAppSync({
        pages: [
          {
            ...DEVICE_PAGE,
            domains: {
              devices: [
                { id: 'd-1', userAgent: agent, lastSeenAt: '2026-08-22T08:00:00.000Z' },
                { id: 'd-2', userAgent: null, lastSeenAt: '2026-08-22T06:15:00.000Z' },
                { id: 'd-3', userAgent: '  ', lastSeenAt: '2026-08-22T09:40:00.000Z' },
              ],
            },
          },
        ],
      });

      const long = await screen.findByText(agent);
      expect(long.getAttribute('title')).toBe(agent);
      expect(screen.getAllByText('Unnamed device')).toHaveLength(2);
      expect(screen.getByText('Last seen 22 Aug 2026 at 10:15')).toBeDefined();
      expect(screen.getByText('Last seen 22 Aug 2026 at 13:40')).toBeDefined();
    }));

  it('should show human command labels with local times', async () =>
    withTimeZone('Asia/Dubai', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T09:37:00.000Z'));
      try {
        setOnline(false);
        const { engine } = renderSyncedAppSync();
        await engine.enqueue({ type: 'expense.create', draft: { amountText: '4.20', currency: 'EUR', categoryId: 'food', occurredOnDate: TODAY, note: 'coffee' } }, TODAY);

        expect(await screen.findByText('Expense')).toBeDefined();
        expect(screen.getByText(/^Created (13:37|01:37\spm) · position 1$/i)).toBeDefined();
        expect(screen.queryByText('expense.create')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    }));
});

describe('Onboarding', () => {
  it('should walk five steps and end on a reviewable first quest', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByRole('heading', { name: 'Set up' })).toBeDefined();
    expect(screen.getByText('Step 1 of 5')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Which part of you does it grow?')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Read 10 pages'), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your week would look like this')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Shields cover the days you could not help')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('Walk 20 minutes')).toBeDefined();
    expect(screen.getByText('Step 5 of 5')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create it and start' })).toBeDefined();
  });

  it('should route an un-onboarded account to setup before anything else renders', async () => {
    const { router } = renderScreen(
      <OnboardingGate>
        <div>Today screen</div>
      </OnboardingGate>,
      { today: TODAY, persona: 'new' },
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  it('should let an onboarded account through the gate untouched', async () => {
    renderScreen(
      <OnboardingGate>
        <div>Today screen</div>
      </OnboardingGate>,
      { today: TODAY },
    );

    expect(await screen.findByText('Today screen')).toBeDefined();
  });

  it('should let a new account choose its home currency', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    const currency = await screen.findByLabelText('Home currency');
    expect(currency.getAttribute('data-disabled')).toBeNull();
    expect(await screen.findByText(/this stays fixed afterwards/)).toBeDefined();
  });

  it('should lock the home currency once onboarding has been completed', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY });
    expect(await screen.findByText('Already set, and fixed from here so your totals stay comparable.')).toBeDefined();
    expect((await screen.findByLabelText('Home currency')).getAttribute('data-disabled')).not.toBeNull();
  });
});
