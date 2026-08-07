import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Spinner } from '@shadow-library/ui';

import { ConsoleShell } from '@/features/console';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/console')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: ConsoleGroup,
});

/**
 * As with the portal, the entry gate does not re-run while navigating inside the console. `useSessionGuard`
 * keeps the session live for as long as the console shell is mounted and bounces to `/login` the moment it
 * ends, withholding the console chrome behind a spinner until the redirect completes.
 */
function ConsoleGroup(): React.JSX.Element {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  );
}
