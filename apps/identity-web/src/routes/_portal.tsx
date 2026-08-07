import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Spinner } from '@shadow-library/ui';

import { PortalShell } from '@/features/portal';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_portal')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: PortalGroup,
});

/**
 * `beforeLoad` guarantees a valid session on entry, but TanStack never re-runs it while navigating inside the
 * portal. `useSessionGuard` keeps re-validating for as long as the shell is mounted and flips to `redirecting`
 * once the session is gone — at which point the chrome is withheld and a spinner shown until the bounce to
 * `/login` completes, so a session that ends mid-use never keeps rendering the portal.
 */
function PortalGroup(): React.JSX.Element {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <PortalShell>
      <Outlet />
    </PortalShell>
  );
}
