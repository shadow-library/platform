import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Spinner } from '@shadow-library/ui';

import { PortalShell } from '@/features/portal';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_portal')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: PortalGroup,
});

/** `beforeLoad` does not re-run inside the portal, so `useSessionGuard` withholds the chrome behind a spinner once the session is gone, until the bounce to `/login`. */
function PortalGroup(): React.JSX.Element {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div className="center h-screen">
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <PortalShell>
      <Outlet />
    </PortalShell>
  );
}
