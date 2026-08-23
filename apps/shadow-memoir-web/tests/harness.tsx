import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { type ReactNode } from 'react';

import { createFixtureProvider, type FixtureProviderOptions, type MemoirData, MemoirDataProvider } from '@/lib/data';

const PATHS = [
  '/plan',
  '/quests',
  '/quests/new',
  '/quests/$questId',
  '/log',
  '/finance',
  '/finance/subscriptions',
  '/hero',
  '/history',
  '/insights',
  '/review',
  '/ai',
  '/settings',
  '/onboarding',
  '/welcome',
];

export function createMemoirTestData(options: FixtureProviderOptions = {}): MemoirData {
  return {
    provider: createFixtureProvider({ today: '2026-08-22', ...options }),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    today: options.today ?? '2026-08-22',
    currency: 'EUR',
  };
}

/**
 * Screens link and navigate, so they need a router in the tree; the harness supplies one whose paths mirror
 * the app's route tree without booting the authenticated shell those routes sit inside.
 */
export function renderScreen(node: ReactNode, options: FixtureProviderOptions & { value?: MemoirData } = {}): RenderResult {
  const rootRoute = createRootRoute({
    component: () => (
      <MemoirDataProvider value={options.value} today={options.today} persona={options.persona}>
        {node}
        <Outlet />
      </MemoirDataProvider>
    ),
  });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    ...PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => null })),
  ];
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: ['/'] }) });

  return render(<RouterProvider router={router as never} />);
}
