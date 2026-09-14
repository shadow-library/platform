import { type AnyRoute, createMemoryHistory, HeadContent, RouterContextProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type NavLeaf } from '@shadow-library/ui/router';

import { AiScreen } from '@/features/ai';
import { ExpensesScreen, SubscriptionsScreen } from '@/features/finance';
import { HeroScreen } from '@/features/hero';
import { HistoryScreen } from '@/features/history';
import { InsightsScreen } from '@/features/insights';
import { OnboardingScreen } from '@/features/onboarding';
import { PlanningBoardScreen } from '@/features/planning';
import { QuickLogScreen } from '@/features/quick-logs';
import { WeeklyReviewScreen } from '@/features/review';
import { SettingsScreen } from '@/features/settings';
import { DESKTOP_NAV, PHONE_NAV } from '@/features/shell';
import { TodayScreen } from '@/features/today';
import { getRouter } from '@/router';

import { renderScreen } from './harness';

function desktopDestinations(): string[] {
  return DESKTOP_NAV.sections.flatMap(section => section.items).map(item => (item as NavLeaf).to);
}

describe('navigation architecture', () => {
  it('should keep the phone bottom bar within three to five destinations', () => {
    expect(PHONE_NAV.length).toBeGreaterThanOrEqual(3);
    expect(PHONE_NAV.length).toBeLessThanOrEqual(5);
  });

  it('should reach every phone destination from the desktop sidebar too', () => {
    const desktop = desktopDestinations();
    for (const item of PHONE_NAV) expect(desktop).toContain(item.to);
  });

  it('should give every destination a distinct path', () => {
    const desktop = desktopDestinations();
    expect(new Set(desktop).size).toBe(desktop.length);
  });
});

describe('screen inventory', () => {
  const screens: [string, () => React.JSX.Element][] = [
    ['Today', TodayScreen],
    ['Planning Board', PlanningBoardScreen],
    ['Quick log', QuickLogScreen],
    ['Money', ExpensesScreen],
    ['Subscriptions', SubscriptionsScreen],
    ['History', HistoryScreen],
    ['Insights', InsightsScreen],
    ['Hero', HeroScreen],
    ['Weekly Review', WeeklyReviewScreen],
    ['Ask', AiScreen],
    ['Settings', SettingsScreen],
    ['Set up', OnboardingScreen],
  ];

  it.each(screens)('should render the %s screen with its heading', async (title, Screen) => {
    renderScreen(<Screen />);
    expect(await screen.findByRole('heading', { name: title })).toBeDefined();
  });
});

describe('document titles', () => {
  afterEach(() => vi.unstubAllGlobals());

  interface ServerStub {
    session: number;
    onboarded: boolean;
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  function stubServer(overrides: Partial<ServerStub> = {}): ServerStub {
    const server: ServerStub = { session: 200, onboarded: true, ...overrides };
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (!String(input).includes('/auth/session')) return json(200, { onboardingCompletedAt: server.onboarded ? '2026-08-01T00:00:00.000Z' : null });
      return server.session === 200 ? json(200, { sub: 'usr_A', scopes: [] }) : json(server.session, { code: 'UNKNOWN', type: 'UnknownError', message: 'Unknown Error' });
    });
    return server;
  }

  async function renderTitleAt(path: string): Promise<ReturnType<typeof getRouter>> {
    const router = getRouter();
    router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
    await router.load();
    document.title = '';
    render(
      <RouterContextProvider router={router}>
        <HeadContent />
      </RouterContextProvider>,
    );
    return router;
  }

  async function expectTitleAt(path: string, title: string): Promise<void> {
    await renderTitleAt(path);
    await waitFor(() => expect(document.title).toBe(title));
  }

  const routes: [string, string][] = [
    ['/', 'Today · Shadow Memoir'],
    ['/plan', 'Planning Board · Shadow Memoir'],
    ['/quests', 'Quests · Shadow Memoir'],
    ['/quests/new', 'New quest · Shadow Memoir'],
    ['/quests/q1', 'Quest details · Shadow Memoir'],
    ['/quests/q1/edit', 'Edit quest · Shadow Memoir'],
    ['/log', 'Journal · Shadow Memoir'],
    ['/log/meals', 'Meals · Shadow Memoir'],
    ['/log/weight', 'Weight · Shadow Memoir'],
    ['/log/health', 'Body & health · Shadow Memoir'],
    ['/log/sidequests', 'Side quests · Shadow Memoir'],
    ['/finance', 'Money · Shadow Memoir'],
    ['/finance/expenses/e1', 'Expense · Shadow Memoir'],
    ['/finance/subscriptions', 'Subscriptions · Shadow Memoir'],
    ['/finance/categories', 'Categories · Shadow Memoir'],
    ['/history', 'History · Shadow Memoir'],
    ['/insights', 'Insights · Shadow Memoir'],
    ['/review', 'Weekly Review · Shadow Memoir'],
    ['/ai', 'Ask · Shadow Memoir'],
    ['/hero', 'Hero · Shadow Memoir'],
    ['/hero/recovery', 'Coming back · Shadow Memoir'],
    ['/settings', 'Settings · Shadow Memoir'],
    ['/settings/notifications', 'Notifications · Shadow Memoir'],
    ['/settings/billing', 'Plan and billing · Shadow Memoir'],
    ['/settings/export', 'Data export · Shadow Memoir'],
    ['/settings/delete', 'Delete your data · Shadow Memoir'],
    ['/settings/app', 'App and sync · Shadow Memoir'],
    ['/nope', 'Not found · Shadow Memoir'],
    ['/log/nope', 'Not found · Shadow Memoir'],
  ];

  it('should give every leaf route a title', () => {
    const routes: AnyRoute[] = Object.values(getRouter().routesById);
    const leaves = routes.filter(route => !route.children);
    expect(leaves.length).toBeGreaterThan(20);
    expect(leaves.filter(route => !route.options.staticData?.title).map(route => route.id)).toEqual([]);
  });

  it.each(routes)('should set a document title per route: %s', async (path, title) => {
    stubServer();
    await expectTitleAt(path, title);
  });

  it('should title the setup route', async () => {
    stubServer({ onboarded: false });
    await expectTitleAt('/onboarding', 'Set up · Shadow Memoir');
  });

  it('should title a route whose guard failed as an error rather than the screen it never reached', async () => {
    stubServer({ session: 500 });
    await expectTitleAt('/finance', 'Couldn’t open this page · Shadow Memoir');
  });

  it('should replace a loaded screen title when its guard fails on a later load', async () => {
    const server = stubServer();
    const router = await renderTitleAt('/finance');
    await waitFor(() => expect(document.title).toBe('Money · Shadow Memoir'));

    server.session = 500;
    router.options.context.queryClient.clear();
    await router.invalidate();

    await waitFor(() => expect(document.title).toBe('Couldn’t open this page · Shadow Memoir'));
  });
});
