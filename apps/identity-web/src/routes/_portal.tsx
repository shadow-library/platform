/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { PortalShell } from '@/features/portal';

/** The authenticated account-portal group (account, applications, organisations list). */
export const Route = createFileRoute('/_portal')({
  component: () => (
    <PortalShell>
      <Outlet />
    </PortalShell>
  ),
});
