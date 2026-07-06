/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { GlobalShell } from '@/components/Layout';

export const Route = createFileRoute('/_app')({
  component: () => (
    <GlobalShell>
      <Outlet />
    </GlobalShell>
  ),
});
