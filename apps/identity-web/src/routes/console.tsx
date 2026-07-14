/**
 * Importing npm packages
 */
import { Outlet, createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { ConsoleShell } from '@/features/console';
import { requireSession } from '@/lib/session';

/** The privileged operator console (`/console/*`). Session is gated here; the identity server enforces admin authorization per endpoint. */
export const Route = createFileRoute('/console')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: () => (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  ),
});
