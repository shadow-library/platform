/**
 * Importing npm packages
 */
import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { HeadContent, Outlet, createRootRouteWithContext, useNavigate } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Button, Result } from 'antd';

/**
 *  Importing user defined modules
 */
import Layout from '../components/Layout';

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
    <Layout>
      <Result
        status="404"
        title="Page not found"
        subTitle="That page doesn’t exist. Head back to your dashboard."
        extra={
          <Button type="primary" onClick={() => navigate({ to: '/' })}>
            Go to dashboard
          </Button>
        }
      />
    </Layout>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFound,
  component: () => (
    <>
      <HeadContent />
      <Outlet />
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
