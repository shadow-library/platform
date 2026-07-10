/**
 * Importing npm packages
 */
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { EmptyState } from '@shadow-library/ui';
import { HeadContent, Outlet, createRootRouteWithContext, useNavigate } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

/**
 *  Importing user defined modules
 */
import { AppShell } from '../components/Layout';

/**
 * Declaring types
 */

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Declaring constants
 */

function NotFound() {
  const navigate = useNavigate();
  return (
    <AppShell>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 28px' }}>
        <EmptyState
          size="page"
          title="Page not found"
          description="That page doesn’t exist. Head back to your projects."
          action={{ label: 'Go to projects', onClick: () => navigate({ to: '/' }) }}
        />
      </div>
    </AppShell>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFound,
  component: () => (
    <>
      <HeadContent />
      <Outlet />
      {import.meta.env.DEV && (
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            { name: 'Tanstack Router', render: <TanStackRouterDevtools /> },
            { name: 'React Query', render: <ReactQueryDevtools /> },
          ]}
        />
      )}
    </>
  ),
});
