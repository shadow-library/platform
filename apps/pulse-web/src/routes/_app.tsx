import { createFileRoute, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

import Layout from '@/components/Layout';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: AuthenticatedShell,
});

// beforeLoad does not re-run on in-shell navigation; once the guard reports `redirecting`, the chrome is withheld so a logged-out user never keeps seeing the app.
function AuthenticatedShell(): ReactElement {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div className="center h-screen">
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
