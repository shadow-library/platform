import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter, isRedirect, Outlet, RouterProvider, useLocation } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@shadow-library/web';

import RouteError from '@/components/RouteError';
import { StatusPage, StatusRegion } from '@/components/StatusPage';
import { type OnboardingStatus } from '@/lib/data';
import { requireSession, routeByOnboarding, seedOnboardingStatus } from '@/lib/session';
import { createSyncedMemoirData, SyncEngineProvider } from '@/lib/sync';
import { getRouter } from '@/router';
import { OnboardingGate } from '@/routes/_app';

import { createMemoirTestData, renderScreen } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const SLOW = { timeout: 10_000 };

function renderAt(path: string) {
  const router = getRouter();
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  return render(<RouterProvider router={router} />);
}

/**
 * The real root document nests `<html>` inside the test container, where jsdom never finishes dispatching a click, so
 * retrying is exercised through a route guarded exactly like `_app` rather than through the full route tree.
 */
function renderGuardedRoute() {
  const queryClient = new QueryClient();
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
  const today = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: ({ context }) => requireSession(context.queryClient, '/'),
    component: () => <div>Today screen</div>,
    errorComponent: RouteError,
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([today]), context: { queryClient }, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SERVER_ERROR = { code: 'UNKNOWN', type: 'UnknownError', message: 'Unknown Error' };

function serverError(): ApiError {
  return new ApiError(500, SERVER_ERROR);
}

describe('app boot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should render the sign-in redirect for the login route', async () => {
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Redirecting to sign-in…' }, SLOW)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Continue to sign-in' })).toBeNull();
  });

  it('should offer a sign-in link when the redirect stalls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt('/login?returnTo=%2Fplan');
    await screen.findByRole('heading', { name: 'Redirecting to sign-in…' }, SLOW);
    expect(screen.queryByRole('link', { name: 'Continue to sign-in' })).toBeNull();

    act(() => vi.advanceTimersByTime(3_000));

    const link = await screen.findByRole('link', { name: 'Continue to sign-in' });
    expect(link.getAttribute('href')).toBe('/api/auth/login?return_to=%2Fplan');
  });

  it('should render a branded not-found page for an unknown path', async () => {
    renderAt('/no-such-screen');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' }, SLOW)).toBeDefined();
    await waitFor(() => expect(document.title).toBe('Not found · Shadow Memoir'));
    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to today' }).getAttribute('href')).toBe('/');
  });

  it('should retry the failed route and session query on Try again', async () => {
    const statuses = [500];
    const sessionRequests: number[] = [];
    vi.stubGlobal('fetch', async () => {
      const status = statuses.shift() ?? 200;
      sessionRequests.push(status);
      return status === 200 ? json(200, { sub: 'usr_A', scopes: [] }) : json(status, SERVER_ERROR);
    });
    renderGuardedRoute();

    const retry = await screen.findByRole('button', { name: 'Try again' }, SLOW);
    expect(screen.getByRole('heading', { name: "Shadow Memoir couldn't open this page" })).toBeDefined();
    expect(screen.queryByText('Unknown Error')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();

    fireEvent.click(retry);

    expect(await screen.findByText('Today screen', undefined, SLOW)).toBeDefined();
    expect(sessionRequests).toEqual([500, 200]);
  });

  it('should offer sign-out instead of a debug code when the session is refused', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
      String(input).includes('/auth/session') ? json(403, { code: 'IAM_002', type: 'Forbidden', message: 'Forbidden' }) : json(500, SERVER_ERROR),
    );
    renderAt('/');

    expect(await screen.findByRole('button', { name: 'Sign out and switch account' }, SLOW)).toBeDefined();
    expect(screen.queryByText(/IAM_002/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
  });
});

function statusFrom(onboarding: () => Promise<OnboardingStatus>, initialPath = '/finance') {
  const data = createMemoirTestData();
  vi.spyOn(data.account, 'getOnboarding').mockImplementation(onboarding);
  const painted: string[] = [];
  const view = renderScreen(
    <OnboardingGate>
      <MoneyScreen painted={painted} />
    </OnboardingGate>,
    { value: data, initialPath },
  );
  return { ...view, data, painted };
}

function renderGate(data: ReturnType<typeof createMemoirTestData>, initialPath: string) {
  return renderScreen(
    <OnboardingGate>
      <div>Money screen</div>
    </OnboardingGate>,
    { value: data, initialPath },
  );
}

function MoneyScreen({ painted }: { painted: string[] }): ReactElement {
  painted.push(useLocation().pathname);
  return <div>Money screen</div>;
}

describe('onboarding gate', () => {
  it('should keep the gate closed while the account is pending', async () => {
    statusFrom(() => new Promise(() => undefined));

    expect(await screen.findByLabelText('Opening your account')).toBeDefined();
    expect(screen.queryByText('Money screen')).toBeNull();
  });

  it('should never paint a deep link before sending a new account to setup', async () => {
    let resolve: (status: OnboardingStatus) => void = () => undefined;
    const { router, painted } = statusFrom(() => new Promise(done => (resolve = done)));

    await screen.findByLabelText('Opening your account');
    resolve({ completed: false });

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    await screen.findByText('Money screen');
    expect(painted.every(pathname => pathname === '/onboarding')).toBe(true);
  });

  it('should show an error when the account request fails', async () => {
    const getOnboarding = vi.fn<() => Promise<OnboardingStatus>>().mockRejectedValueOnce(serverError()).mockResolvedValue({ completed: true });
    statusFrom(getOnboarding);

    expect(await screen.findByRole('heading', { name: "We couldn't load your account" })).toBeDefined();
    expect(screen.queryByText('Money screen')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Money screen')).toBeDefined();
    expect(getOnboarding).toHaveBeenCalledTimes(2);
  });

  it('should open from the synced account when the account request fails after a sync', async () => {
    const { engine } = createTestEngine({
      pages: [{ cursor: '1', hasMore: false, domains: { account: [{ id: 'usr_A', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }] }, tombstones: [] }],
    });
    const data = createSyncedTestData(engine);
    vi.spyOn(data.account, 'getOnboarding').mockRejectedValue(serverError());

    renderScreen(
      <SyncEngineProvider data={data}>
        <OnboardingGate>
          <div>Money screen</div>
        </OnboardingGate>
      </SyncEngineProvider>,
      { value: data, initialPath: '/finance' },
    );

    expect(await screen.findByText('Money screen')).toBeDefined();
  });

  it('should redirect onboarded owners away from onboarding', async () => {
    const { router } = statusFrom(() => Promise.resolve({ completed: true }), '/onboarding');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('should let a new owner finish setup without being bounced from onboarding', async () => {
    const statuses: OnboardingStatus[] = [{ completed: false }];
    const { router, data } = statusFrom(() => Promise.resolve(statuses.shift() ?? { completed: true }), '/onboarding');

    expect(await screen.findByText('Money screen')).toBeDefined();
    await data.queryClient.invalidateQueries();

    await waitFor(() => expect(data.account.getOnboarding).toHaveBeenCalledTimes(2));
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(screen.getByText('Money screen')).toBeDefined();
  });

  it('should redirect an owner who returns to onboarding after finishing setup', async () => {
    const statuses: OnboardingStatus[] = [{ completed: false }];
    const { router, data } = statusFrom(() => Promise.resolve(statuses.shift() ?? { completed: true }), '/onboarding');
    await screen.findByText('Money screen');
    await data.queryClient.invalidateQueries();
    await waitFor(() => expect(data.account.getOnboarding).toHaveBeenCalledTimes(2));

    await act(() => router.navigate({ to: '/plan' }));
    await act(() => router.navigate({ to: '/onboarding' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('store gate', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  });

  it('should show the store error with owner copy when indexedDB access throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    const data = createSyncedMemoirData({ accountId: 'usr_A' });

    renderScreen(
      <SyncEngineProvider data={data}>
        <div>Meals screen</div>
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByRole('heading', { name: "This device couldn't open its local store" })).toBeDefined();
    expect(screen.queryByText('blocked')).toBeNull();
    expect(screen.queryByText('Meals screen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('should open the store on Try again once storage is allowed again', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    const data = createSyncedMemoirData({ accountId: 'usr_A' });
    renderScreen(
      <SyncEngineProvider data={data}>
        <div>Meals screen</div>
      </SyncEngineProvider>,
      { value: data },
    );
    const retry = await screen.findByRole('button', { name: 'Try again' });

    Reflect.deleteProperty(globalThis, 'indexedDB');
    fireEvent.click(retry);

    expect(await screen.findByText('Meals screen')).toBeDefined();
  });
});

describe('status page', () => {
  it('should render inside the shell as a region without a second landmark or brand', () => {
    render(
      <StatusRegion>
        <StatusPage title="Shadow Memoir couldn't open this page" />
      </StatusRegion>,
    );

    expect(screen.queryByRole('main')).toBeNull();
    expect(screen.getByRole('region', { name: "Shadow Memoir couldn't open this page" })).toBeDefined();
    expect(screen.queryByText('Shadow Memoir')).toBeNull();
  });
});

const ACCOUNT_ID = 'usr_A';

function bootFetch(account: () => Response): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/session')) return json(200, { sub: ACCOUNT_ID, scopes: [] });
    if (url.endsWith('/v1/account')) return account();
    return json(500, SERVER_ERROR);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function loadRouter(path: string) {
  const router = getRouter();
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return router;
}

describe('server render of the shell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should paint the app chrome for an onboarded owner deep link', async () => {
    bootFetch(() => json(200, { id: ACCOUNT_ID, onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }));
    const router = await loadRouter('/finance');

    const html = renderToString(<RouterProvider router={router} />);

    expect(router.state.location.pathname).toBe('/finance');
    expect(html).toContain('Quick capture');
    expect(html).not.toContain('Opening your account');
  });

  it('should redirect a not-onboarded deep link before any screen renders', async () => {
    const fetch = bootFetch(() => json(200, { id: ACCOUNT_ID, onboardingCompletedAt: null }));
    const router = await loadRouter('/finance');

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    expect(router.state.matches.some(match => match.routeId === '/_app/finance/')).toBe(false);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/v1/account'))).toHaveLength(1);
  });

  it('should leave a failed account read to the client gate', async () => {
    const queryClient = new QueryClient();
    bootFetch(() => json(500, SERVER_ERROR));

    await expect(routeByOnboarding(queryClient, ACCOUNT_ID, '/finance')).resolves.toBeUndefined();
  });

  it('should not refetch the account after an onboarded boot', async () => {
    const routerClient = new QueryClient();
    const fetch = bootFetch(() => json(200, { id: ACCOUNT_ID, onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }));
    await routeByOnboarding(routerClient, ACCOUNT_ID, '/finance');
    const data = createMemoirTestData();
    const getOnboarding = vi.spyOn(data.account, 'getOnboarding');

    seedOnboardingStatus(routerClient, data.queryClient, ACCOUNT_ID);
    renderGate(data, '/finance');

    expect(await screen.findByText('Money screen')).toBeDefined();
    expect(getOnboarding).not.toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/v1/account'))).toHaveLength(1);
  });

  it('should not restore a stale not-onboarded answer when switching back to an account', async () => {
    const routerClient = new QueryClient();
    bootFetch(() => json(200, { id: 'usr_A', onboardingCompletedAt: null }));
    await expect(routeByOnboarding(routerClient, 'usr_A', '/onboarding')).resolves.toEqual({ completed: false });

    bootFetch(() => json(200, { id: 'usr_B', onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }));
    await routeByOnboarding(routerClient, 'usr_B', '/finance');

    await expect(routeByOnboarding(routerClient, 'usr_A', '/finance')).resolves.toEqual({ completed: false });
    const data = createMemoirTestData();
    vi.spyOn(data.account, 'getOnboarding').mockResolvedValue({ completed: true });
    seedOnboardingStatus(routerClient, data.queryClient, 'usr_A');
    const { router } = renderGate(data, '/finance');

    expect(await screen.findByText('Money screen')).toBeDefined();
    expect(router.state.location.pathname).toBe('/finance');
  });

  it('should send an onboarded owner at onboarding home', async () => {
    const queryClient = new QueryClient();
    bootFetch(() => json(200, { id: ACCOUNT_ID, onboardingCompletedAt: '2026-01-01T00:00:00.000Z' }));

    const outcome = await routeByOnboarding(queryClient, ACCOUNT_ID, '/onboarding').catch((error: unknown) => error);

    expect(isRedirect(outcome)).toBe(true);
    expect(isRedirect(outcome) && outcome.options.to).toBe('/');
  });
});
