import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useMemo } from 'react';
import { Spinner } from '@shadow-library/ui';

import { AppShell } from '@/features/shell';
import { MemoirDataProvider, useOnboardingStatus } from '@/lib/data';
import { requireSession, useSessionGuard } from '@/lib/session';
import { createSyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

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
  const data = useMemo(() => createSyncedMemoirData(), []);

  if (status === 'redirecting')
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <Spinner aria-label="Redirecting to sign-in" />
      </div>
    );

  return (
    <MemoirDataProvider value={data}>
      <SyncEngineProvider data={data}>
        <OnboardingGate>
          <AppShell>
            <Outlet />
          </AppShell>
        </OnboardingGate>
      </SyncEngineProvider>
    </MemoirDataProvider>
  );
}

/**
 * `onboarding_completed_at` null means the account has never chosen a currency or a wake window
 * (ARCHITECTURE §9.1), and every other screen would be reading defaults nobody agreed to — so the shell
 * routes there instead. The gate lives inside the data provider because that is where the account read is.
 */
export function OnboardingGate({ children }: { children: ReactElement }): ReactElement {
  const onboarding = useOnboardingStatus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const redirect = onboarding.data?.completed === false && pathname !== '/onboarding';

  useEffect(() => {
    if (redirect) void navigate({ to: '/onboarding', replace: true });
  }, [redirect, navigate]);

  if (redirect)
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
        <Spinner aria-label="Opening setup" />
      </div>
    );

  return children;
}
