/**
 * Importing npm packages
 */
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

/**
 * Importing user defined modules
 */
import { DefaultCatchBoundary, PageSkeleton, RouteNotFound } from '@/components/nf';
import { routeTree } from './routeTree.gen';

/**
 * Declaring the constants
 */

/**
 * TanStack Start calls this once per request on the server and once on the client. A fresh QueryClient
 * per call keeps one request's cache from ever leaking into another's, while `setupRouterSsrQueryIntegration`
 * dehydrates the queries a loader resolves during SSR and rehydrates them on the client (no refetch).
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Loaders prefetch route-critical queries; a non-zero staleTime stops the component's matching
        // useQuery from refetching the instant it hydrates the dehydrated result.
        staleTime: 30_000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Router keeps no loader-result cache of its own (always re-invokes the loader on preload); React Query
    // owns freshness and dedupes the actual fetch via staleTime, so the two caches never disagree.
    defaultPreloadStaleTime: 0,
    // Only surface a pending UI once a navigation is genuinely slow, then hold it briefly so it can't flicker.
    defaultPendingMs: 200,
    defaultPendingMinMs: 500,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: RouteNotFound,
    defaultPendingComponent: PageSkeleton,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
