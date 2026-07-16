/**
 * Importing npm packages
 */
import { createAppRouter } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary';
import { NotFound } from '@/components/NotFound';

import { routeTree } from './routeTree.gen';

/**
 * Declaring the constants
 *
 * TanStack Start calls `getRouter` once per request on the server. `createAppRouter` (from
 * `@shadow-library/web`) owns the per-request QueryClient, the SSR-query integration, and the shared
 * preload/staleness/pending defaults — so this app only supplies its own error and not-found screens.
 */
export function getRouter() {
  return createAppRouter(routeTree, {
    router: {
      defaultErrorComponent: DefaultCatchBoundary,
      defaultNotFoundComponent: NotFound,
    },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
