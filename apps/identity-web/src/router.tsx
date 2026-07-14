/**
 * Importing npm packages
 */
import { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

/**
 * Importing user defined packages
 */
import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary';
import { NotFound } from '@/components/NotFound';

import { routeTree } from './routeTree.gen';

/**
 * Declaring the constants
 *
 * TanStack Start calls `getRouter` once per request on the server, so the QueryClient is created here
 * (never module-level) — that keeps each request's cache isolated and stops one user's dehydrated data
 * leaking into another's. `setupRouterSsrQueryIntegration` installs the QueryClientProvider and wires
 * dehydration/hydration, and `defaultPreloadStaleTime: 0` lets TanStack Query — not the router — own
 * staleness so the two caches never disagree.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Identity data is session-scoped and changes rarely within a view; a short stale window keeps
        // navigation snappy without serving stale security state after a mutation invalidates its keys.
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: NotFound,
    // Instant navigations shouldn't flash a skeleton; once one shows, hold it briefly so it can't flicker.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
