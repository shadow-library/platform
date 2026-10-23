import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';
import { type AnyRoute, createRouter, type Router } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

export interface CreateAppRouterOptions {
  /** Extra QueryClient config merged over the Shadow defaults. */
  queryClient?: QueryClientConfig;
  /** Additional TanStack Router options merged over (and overriding) the Shadow defaults, e.g. `defaultErrorComponent` / `defaultNotFoundComponent`. */
  router?: object;
}

// TanStack Start calls this once per request on the server, so the QueryClient is created here, never at module level, to keep each request's cache isolated.
// Return type annotated so the emitted declaration names only `@tanstack/react-router`, not `router-core`/`history`, which a consumer may not resolve.
export function createAppRouter<TRouteTree extends AnyRoute>(routeTree: TRouteTree, options: CreateAppRouterOptions = {}): Router<TRouteTree, 'never', true> {
  const queryClient = new QueryClient({
    ...options.queryClient,
    defaultOptions: {
      ...options.queryClient?.defaultOptions,
      queries: {
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
    // Zero so TanStack Query, not the router, owns staleness and the two caches never disagree.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    // Instant navigations shouldn't flash a skeleton; once shown, it is held so it can't flicker.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    ...options.router,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
