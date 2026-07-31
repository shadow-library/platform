/**
 * Importing npm packages
 */
import { createAppRouter } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import NotFound from '@/components/NotFound';
import RouteError from '@/components/RouteError';

import { routeTree } from '../generated/routeTree.gen';

/**
 * Declaring the constants
 *
 * TanStack Start calls this once per request on the server and once on the client. `createAppRouter`
 * (from `@shadow-library/web`) owns the per-request QueryClient, the SSR-query integration, and the
 * shared preload/staleness/pending defaults — so this app only supplies its own error and not-found
 * screens.
 *
 * Without an error component a route that throws renders TanStack's bare default, which says nothing an
 * operator can act on — least of all for a 403, the one failure they meet by simply lacking a role.
 * Without a not-found component an unmatched path renders TanStack's bare `<p>Not Found</p>`.
 */
const buildRouter = () => createAppRouter(routeTree, { router: { defaultErrorComponent: RouteError, defaultNotFoundComponent: NotFound } });

export function getRouter(): ReturnType<typeof buildRouter> {
  return buildRouter();
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
