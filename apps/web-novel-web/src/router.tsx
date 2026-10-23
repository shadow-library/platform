import { createAppRouter } from '@shadow-library/web/router';

import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary';
import { NotFound } from '@/components/NotFound';

import { routeTree } from './routeTree.gen';

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
