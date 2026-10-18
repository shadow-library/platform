import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Spinner } from '@shadow-library/ui';

import { Layout } from '@/components';
import { isApiError, loadCapabilities, requireSession, useSessionGuard } from '@/lib';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    await requireSession(context.queryClient, location.href);
    await loadCapabilities(context.queryClient).catch((error: unknown) => {
      if (isApiError(error) && error.status === 401) throw redirect({ to: '/login', search: { returnTo: location.href } });
      throw error;
    });
  },
  component: AuthenticatedShell,
});

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
