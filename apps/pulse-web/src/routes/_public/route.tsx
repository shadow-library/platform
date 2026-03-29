/**
 * Importing npm packages
 */
import { AppLayout } from '@shadow-library/ui';
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { navItems } from './-constants/route.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function Layout() {
  return (
    <AppLayout appName='Pulse' navItems={navItems}>
      <Outlet />
    </AppLayout>
  );
}

export const Route = createFileRoute('/_public')({
  component: Layout,
});
