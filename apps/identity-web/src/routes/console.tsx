import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Spinner } from '@shadow-library/ui';

import { ConsoleShell } from '@/features/console';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/console')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: ConsoleGroup,
});

/** The entry gate does not re-run inside the console, so `useSessionGuard` withholds the chrome behind a spinner once the session ends. */
function ConsoleGroup(): React.JSX.Element {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div className="center h-screen">
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  );
}
