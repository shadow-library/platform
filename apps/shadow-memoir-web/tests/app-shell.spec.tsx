import { toast, TooltipProvider } from '@shadow-library/ui';
import { ApiError, userInfoQueryKey } from '@shadow-library/web';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/features/shell';
import shellStyles from '@/features/shell/app-shell.module.css';
import { loginUrl, logout } from '@/lib/apis';
import { MemoirDataProvider } from '@/lib/data';
import { SyncEngineProvider, type SyncSnapshot, useSyncStatus } from '@/lib/sync';

import { createMemoirTestData } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

vi.mock('@/lib/apis', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/apis')>();
  return { ...actual, logout: vi.fn() };
});

vi.mock('@/lib/sync', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/sync')>();
  return { ...actual, useSyncStatus: vi.fn(actual.useSyncStatus) };
});

const ONLINE_SNAPSHOT: SyncSnapshot = {
  state: 'online',
  queuedCount: 0,
  lastSyncedAt: null,
  notices: [],
  initError: null,
  readiness: { kind: 'ready' },
  readySince: 0,
  sending: [],
};

const PATHS = [
  '/',
  '/plan',
  '/quests',
  '/quests/new',
  '/log',
  '/log/meals',
  '/log/weight',
  '/log/health',
  '/log/sidequests',
  '/finance',
  '/history',
  '/insights',
  '/review',
  '/ai',
  '/hero',
  '/settings',
];

function stubPhoneViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function stubDesktopViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

function renderAppShell(initialPath = '/'): ReturnType<typeof render> {
  const data = createMemoirTestData();
  data.queryClient.setQueryData(userInfoQueryKey, { sub: 'usr_1', name: 'Ada Lovelace', email: 'ada@example.com' });

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={data.queryClient}>
        <MemoirDataProvider value={data}>
          <TooltipProvider>
            <AppShell>
              <div>Today</div>
            </AppShell>
          </TooltipProvider>
        </MemoirDataProvider>
      </QueryClientProvider>
    ),
  });
  const routes = PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => null }));
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: [initialPath] }) });

  return render(<RouterProvider router={router as never} />);
}

/** Wires a real `SyncEngine`/`MemoirStore` behind the shell, for the one test that checks the wipe actually runs. */
function renderSyncedAppShell(): { store: ReturnType<typeof createTestEngine>['store'] } {
  const { engine, store } = createTestEngine({ today: '2026-08-24' });
  const data = createSyncedTestData(engine);
  data.queryClient.setQueryData(userInfoQueryKey, { sub: 'usr_1', name: 'Ada Lovelace', email: 'ada@example.com' });

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={data.queryClient}>
        <MemoirDataProvider value={data}>
          <SyncEngineProvider data={data}>
            <TooltipProvider>
              <AppShell>
                <div>Today</div>
              </AppShell>
            </TooltipProvider>
          </SyncEngineProvider>
        </MemoirDataProvider>
      </QueryClientProvider>
    ),
  });
  const routes = PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => null }));
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router as never} />);

  return { store };
}

describe('AppShell quick-capture FAB', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should render the quick-capture FAB with fixed placement on phone', async () => {
    stubPhoneViewport();
    renderAppShell();

    const fab = await screen.findByRole('button', { name: 'Quick capture' });
    expect(fab.getAttribute('data-placement')).toBe('fixed');
  });

  it('should always render the FAB and reserve its clearance, even on desktop where CSS hides it', async () => {
    stubDesktopViewport();
    const { container } = renderAppShell();

    const fab = await screen.findByRole('button', { name: 'Quick capture' });
    expect(fab.classList.contains(shellStyles.fab ?? '')).toBe(true);

    const shellRoot = container.querySelector('[data-bottom-nav]');
    expect(shellRoot?.classList.contains(shellStyles.fabClearance ?? '')).toBe(true);
  });
});

describe('AppShell navigation highlighting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should highlight the sidebar item for nested log and quest routes', async () => {
    stubDesktopViewport();
    renderAppShell('/log/weight');
    expect((await screen.findByRole('link', { name: 'Weight' })).getAttribute('aria-current')).toBe('page');
  });

  it('should highlight the Quests sidebar item for a quest sub-route', async () => {
    stubDesktopViewport();
    renderAppShell('/quests/new');
    expect((await screen.findByRole('link', { name: 'Quests' })).getAttribute('aria-current')).toBe('page');
  });

  it('should not highlight a bottom nav item for routes it does not carry', async () => {
    stubPhoneViewport();
    renderAppShell('/insights');

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const items = within(nav).getAllByRole('link');
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(item => item.getAttribute('aria-current') === 'page')).toBe(false);
  });

  it('should not duplicate a bottom nav item’s label in its accessible name', async () => {
    stubPhoneViewport();
    renderAppShell('/');

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const today = within(nav).getByRole('link', { name: 'Today' });
    expect(today.textContent).toBe('Today');
  });
});

describe('AppShell sign-out', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(logout).mockReset();
    vi.mocked(useSyncStatus).mockReset();
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('should disable the sign-out item while signing out and ignore a repeat select', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    vi.mocked(logout).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    const pending = await screen.findByRole('menuitem', { name: 'Signing out…' });
    expect(pending.getAttribute('aria-disabled')).toBe('true');

    await user.click(pending);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('should skip logout entirely and warn when already offline', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    const warning = vi.spyOn(toast, 'warning');
    setOnline(false);
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(logout).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('Sign out needs a connection — nothing was removed.');
  });

  it('should warn and re-enable sign-out when logout fails at the network level, without redirecting', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    vi.mocked(logout).mockRejectedValue(new ApiError(-1, { code: 'NETWORK_ERROR', type: 'NetworkError', message: 'Unable to reach the server' }));
    const warning = vi.spyOn(toast, 'warning');
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith('Sign out needs a connection — nothing was removed.'));

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeDefined();
  });

  it('should danger-toast and re-enable sign-out on a non-network, non-401 failure, without redirecting', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    vi.mocked(logout).mockRejectedValue(new ApiError(500, { code: 'UNKNOWN_ERROR', type: 'UnknownError', message: 'boom' }));
    const danger = vi.spyOn(toast, 'danger');
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(danger).toHaveBeenCalledWith('Couldn’t sign out — try again'));

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeDefined();
  });

  it('should wipe the account and redirect to the identity provider on a successful sign-out', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    vi.mocked(logout).mockResolvedValue({ success: true });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/current', search: '?query=1', assign });

    const { store } = renderSyncedAppShell();
    const wipeSpy = vi.spyOn(store, 'wipeAccount');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(wipeSpy).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith(loginUrl('/current?query=1'));
  });

  it('should ask for confirmation before discarding unsynced changes, and stop there if declined', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue({ ...ONLINE_SNAPSHOT, queuedCount: 3 });
    const user = userEvent.setup();
    renderAppShell();

    const accountTrigger = await screen.findByRole('button', { name: 'Account menu' });
    await user.click(accountTrigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out and discard 3 unsynced changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep working' }));

    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(accountTrigger));
  });

  it('should proceed once the queued-changes confirmation is accepted', async () => {
    stubDesktopViewport();
    vi.mocked(useSyncStatus).mockReturnValue({ ...ONLINE_SNAPSHOT, queuedCount: 3 });
    vi.mocked(logout).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('AppShell phone drawer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(useSyncStatus).mockReset();
    vi.mocked(logout).mockReset();
  });

  it('should include account actions in the phone drawer', async () => {
    stubPhoneViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).getByText('Ada Lovelace')).toBeDefined();
    expect(within(drawer).getByText('ada@example.com')).toBeDefined();
    expect(within(drawer).getByRole('button', { name: 'Toggle theme' })).toBeDefined();
    expect(within(drawer).getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('should disable the drawer’s sign-out button while signing out', async () => {
    stubPhoneViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    vi.mocked(logout).mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Sign out' }));

    const pending = await within(drawer).findByRole('button', { name: 'Signing out…' });
    expect(pending.hasAttribute('disabled')).toBe(true);
  });

  it('should return focus to the drawer’s sign-out button when the queued-changes confirmation is cancelled', async () => {
    stubPhoneViewport();
    vi.mocked(useSyncStatus).mockReturnValue({ ...ONLINE_SNAPSHOT, queuedCount: 2 });
    const user = userEvent.setup();
    renderAppShell();

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog');
    const signOutButton = within(drawer).getByRole('button', { name: 'Sign out' });
    await user.click(signOutButton);

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Keep working' }));

    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(signOutButton));
  });

  it('should return focus to the hamburger once the drawer closes', async () => {
    stubPhoneViewport();
    vi.mocked(useSyncStatus).mockReturnValue(ONLINE_SNAPSHOT);
    const user = userEvent.setup();
    renderAppShell();

    // `fireEvent.click`, not `user.click`: userEvent's realistic click already focuses the hamburger, which
    // would let Radix's own (unreliable) restore make this pass without `DrawerFocusReturn` doing anything.
    const hamburger = await screen.findByRole('button', { name: 'Open navigation' });
    fireEvent.click(hamburger);
    await screen.findByRole('dialog');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).not.toBe(hamburger);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.activeElement).toBe(hamburger));
  });
});
