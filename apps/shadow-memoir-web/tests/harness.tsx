import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { type ReactNode } from 'react';

import { createMemoirData, type FixtureProviderOptions, type MemoirData, MemoirDataProvider } from '@/lib/data';

/** Every destination the app can link to, so a screen's `Link`s resolve against the real route tree. */
const PATHS = [
  '/plan',
  '/quests',
  '/quests/new',
  '/quests/$questId',
  '/log',
  '/log/meals',
  '/log/weight',
  '/log/health',
  '/log/sidequests',
  '/finance',
  '/finance/subscriptions',
  '/finance/categories',
  '/finance/expenses/$expenseId',
  '/history',
  '/insights',
  '/review',
  '/ai',
  '/hero',
  '/hero/recovery',
  '/settings',
  '/settings/notifications',
  '/settings/billing',
  '/settings/export',
  '/settings/delete',
  '/settings/app',
  '/onboarding',
  '/welcome',
];

export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

export function createMemoirTestData(options: FixtureProviderOptions = {}): MemoirData {
  const today = options.today ?? '2026-08-22';
  return { ...createMemoirData({ ...options, today }), queryClient: testQueryClient() };
}

/** For a component that reads a domain provider directly and never links anywhere. */
export function renderWithQuery(ui: ReactNode): RenderResult {
  return render(<QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>);
}

export interface RenderScreenOptions extends FixtureProviderOptions {
  value?: MemoirData;
  initialPath?: string;
}

/**
 * Screens link and navigate, so they need a router in the tree; the harness supplies one whose paths mirror
 * the app's route tree without booting the authenticated shell those routes sit inside. The seam's own
 * QueryClient is also installed as the React Query provider, so the day group's `MemoirData` reads and the
 * finance/quick-log hooks share one cache.
 */
export function renderScreen(node: ReactNode, options: RenderScreenOptions = {}): RenderResult {
  const data = options.value ?? createMemoirTestData({ today: options.today, persona: options.persona });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={data.queryClient}>
        <MemoirDataProvider value={data}>
          {node}
          <Outlet />
        </MemoirDataProvider>
      </QueryClientProvider>
    ),
  });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    ...PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => null })),
  ];
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: [options.initialPath ?? '/'] }) });

  return render(<RouterProvider router={router as never} />);
}
