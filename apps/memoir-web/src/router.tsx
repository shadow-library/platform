import { type Router } from '@tanstack/react-router';
import { createAppRouter } from '@shadow-library/web/router';

import NotFound from '@/components/NotFound';
import RouteError from '@/components/RouteError';

import { routeTree } from '../generated/routeTree.gen';

export function getRouter(): Router<typeof routeTree, 'never', true> {
  return createAppRouter(routeTree, { router: { defaultErrorComponent: RouteError, defaultNotFoundComponent: NotFound } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: Router<typeof routeTree, 'never', true>;
  }
}
