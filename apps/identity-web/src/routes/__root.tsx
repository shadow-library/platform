/**
 * Importing npm packages
 */
import { Button } from '@shadow-library/ui';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { HeadContent, Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

/**
 *  Importing user defined modules
 */
import { ShieldIcon } from '@/components/icons';

import styles from './__root.module.css';

/**
 * Declaring types
 */

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Declaring constants
 */

function NotFound(): React.JSX.Element {
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundMark}>
        <ShieldIcon size={26} />
      </div>
      <h1 className={styles.notFoundTitle}>Page not found</h1>
      <p className={styles.notFoundText}>That page doesn’t exist or you don’t have access to it.</p>
      <Button variant="primary" asChild>
        <Link to="/account">Go to your account</Link>
      </Button>
    </div>
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
