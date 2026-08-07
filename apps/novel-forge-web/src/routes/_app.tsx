import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Spinner } from '@shadow-library/ui';

import { AppShell } from '@/components/Layout';
import { meQuery } from '@/lib/apis';
import { requireSession, useSessionGuard } from '@/lib/session';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  /**
   * Warms the author's name so the shell renders it server-side rather than flashing the fallback and
   * swapping it on hydration. The rejection is swallowed on purpose: this is chrome, and a name that
   * could not be fetched must never take down a screen the session gate already cleared — the
   * components fall back on their own.
   */
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery).catch(() => undefined),
  component: AuthenticatedShell,
});

/**
 * `beforeLoad` guarantees a valid session on entry, but TanStack never re-runs it while navigating inside
 * the shell. `useSessionGuard` keeps re-validating for as long as the shell is mounted and flips to
 * `redirecting` once the session is gone — at which point the chrome is withheld and a spinner shown until
 * the bounce to sign-in completes, so a session that ends mid-use never keeps rendering the app.
 */
function AuthenticatedShell(): React.JSX.Element {
  const status = useSessionGuard();

  if (status === 'redirecting')
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
