import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

import { AppShell } from '@/features/shell';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: AuthenticatedShell,
});

/**
 * `beforeLoad` guarantees a session on entry, but TanStack reuses the layout match and never re-runs it
 * while navigating inside the shell. `useSessionGuard` keeps validating for as long as the shell is mounted
 * and flips to `redirecting` once the session is gone, so a signed-out owner never keeps seeing the app.
 */
function AuthenticatedShell(): ReactElement {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
