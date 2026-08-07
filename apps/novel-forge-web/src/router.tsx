import { createAppRouter } from '@shadow-library/web/router';

import { DefaultCatchBoundary, PageSkeleton, RouteNotFound } from '@/components/nf';
import { routeTree } from '../generated/routeTree.gen';

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
