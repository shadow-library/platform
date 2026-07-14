/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { PortalShell } from '@/features/portal';
import { requireSession } from '@/lib/session';

/** The authenticated account-portal group (account, applications, organisations list). */
export const Route = createFileRoute('/_portal')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: () => (
    <PortalShell>
      <Outlet />
    </PortalShell>
  ),
});
