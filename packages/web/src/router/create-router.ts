/**
 * Importing npm packages
 */
import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { type AnyRoute, createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface CreateAppRouterOptions {
  /** Extra QueryClient config merged over the Shadow defaults. */
  queryClient?: QueryClientConfig;
  /** Additional TanStack Router options merged over (and overriding) the Shadow defaults, e.g. `defaultErrorComponent` / `defaultNotFoundComponent`. */
  router?: object;
}

/**
 * Declaring the constants
 */

/**
 * Build a router the Shadow way. TanStack Start calls this once per request on the server, so the
 * QueryClient is created here (never module-level) — that keeps each request's cache isolated and stops one
 * user's dehydrated data leaking into another's. `setupRouterSsrQueryIntegration` installs the
 * QueryClientProvider and wires dehydration/hydration, and `defaultPreloadStaleTime: 0` lets TanStack Query
 * — not the router — own staleness so the two caches never disagree.
 */
export function createAppRouter<TRouteTree extends AnyRoute>(routeTree: TRouteTree, options: CreateAppRouterOptions = {}) {
  const queryClient = new QueryClient({
    ...options.queryClient,
    defaultOptions: {
      ...options.queryClient?.defaultOptions,
      queries: {
        // Session-scoped data changes rarely within a view; a short stale window keeps navigation snappy
        // without serving stale state after a mutation invalidates its keys.
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        ...options.queryClient?.defaultOptions?.queries,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    // Instant navigations shouldn't flash a skeleton; once one shows, hold it briefly so it can't flicker.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    ...options.router,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
