import { createAppRouter } from '@shadow-library/web/router';

import NotFound from '@/components/NotFound';
import RouteError from '@/components/RouteError';

import { routeTree } from '../generated/routeTree.gen';

// Replaces TanStack's bare defaults, which say nothing actionable for a 403 or an unmatched path.
const buildRouter = () => createAppRouter(routeTree, { router: { defaultErrorComponent: RouteError, defaultNotFoundComponent: NotFound } });

export function getRouter(): ReturnType<typeof buildRouter> {
  return buildRouter();
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
