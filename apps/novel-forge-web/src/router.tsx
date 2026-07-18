/**
 * Importing npm packages
 */
import { createAppRouter } from '@shadow-library/web/router';

/**
 * Importing user defined modules
 */
import { DefaultCatchBoundary, PageSkeleton, RouteNotFound } from '@/components/nf';
import { routeTree } from '../generated/routeTree.gen';

/**
 * Declaring the constants
 */

/**
 * TanStack Start calls this once per request on the server and once on the client. `createAppRouter`
 * owns the Shadow wiring — a per-request QueryClient (no cross-request cache leaks), the SSR query
 * dehydration/rehydration, and the preload/pending defaults — so only the app's boundary components
 * are configured here.
 */
const buildRouter = () =>
  createAppRouter(routeTree, {
    router: {
      defaultErrorComponent: DefaultCatchBoundary,
      defaultNotFoundComponent: RouteNotFound,
      defaultPendingComponent: PageSkeleton,
    },
  });

export function getRouter(): ReturnType<typeof buildRouter> {
  return buildRouter();
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
