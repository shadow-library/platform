/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { WorkspaceShell } from '@/components/Layout';

export const Route = createFileRoute('/novels/$novelId')({
  component: () => (
    <WorkspaceShell>
      <Outlet />
    </WorkspaceShell>
  ),
});
