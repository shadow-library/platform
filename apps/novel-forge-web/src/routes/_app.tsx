/**
 * Importing npm packages
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { AppShell } from '@/components/Layout';
import { requireSession } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
