import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingScreen } from '@/features/onboarding';
import { AppSyncScreen, BillingScreen, DeleteAccountScreen, ExportScreen, NotificationSettingsScreen, SettingsScreen } from '@/features/settings';
import { type DeltaPage, SyncEngineProvider } from '@/lib/sync';
import { OnboardingGate } from '@/routes/_app';

import { renderScreen } from './harness';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, type FakeServer, type TestEngineOptions } from './sync-harness';

const TODAY = '2026-08-22';

describe('Settings screen', () => {
  it('should render the day, appearance and data sections', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(await screen.findByText('Day and money')).toBeDefined();
    expect(screen.getByText('Appearance and behaviour')).toBeDefined();
    expect(screen.getByText('Data and privacy')).toBeDefined();
  });

  it('should keep the home currency fixed once it has been set', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    const currency = await screen.findByLabelText('Home currency');
    expect(currency.getAttribute('data-disabled')).not.toBeNull();
    expect(await screen.findByText(/Fixed when you set up/)).toBeDefined();
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
});

describe('Data export', () => {
  it('should prepare an archive without changing anything', async () => {
    renderScreen(<ExportScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Data export' })).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare the export' }));
    expect(await screen.findByText('Preparing')).toBeDefined();
    expect(await screen.findByText(/You can leave this page/)).toBeDefined();
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
