/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { AppShell } from '@/components/Layout';

export const Route = createFileRoute('/_app')({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
