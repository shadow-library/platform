/**
 * Importing npm packages
 */
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { HeadContent, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

/**
 *  Importing user defined modules
 */
import Header from '../components/Header';

/**
 * Declaring types
 */

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Declaring constants
 */

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <HeadContent />
      <Header>
        <Outlet />
      </Header>
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          { name: 'Tanstack Router', render: <TanStackRouterDevtools /> },
          { name: 'React Query', render: <ReactQueryDevtools /> },
        ]}
      />
    </>
  ),
});
