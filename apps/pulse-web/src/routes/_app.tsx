import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

import Layout from '@/components/Layout';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: AuthenticatedShell,
});

/**
 * `beforeLoad` guarantees a valid session on entry, but TanStack never re-runs it while navigating
 * inside the shell. `useSessionGuard` keeps validating for as long as the shell is mounted and flips to
 * `redirecting` once the session is gone — at which point we withhold the chrome and show a spinner
 * until the bounce to SSO completes, so a logged-out user never keeps seeing the app.
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
    <Layout>
      <Outlet />
    </Layout>
  );
}
