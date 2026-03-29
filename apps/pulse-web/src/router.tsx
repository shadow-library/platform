/**
 * Importing npm packages
 */
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import '@mantine/core/styles.css';
import '@shadow-library/ui/styles.css';

/**
 * Importing user defined packages
 */
import { routeTree } from './routeTree.gen';

/**
 * Defining types
 */

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

/**
 * Declaring the constants
 */

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });

  return router;
}
