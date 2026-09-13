import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Button, Spinner } from '@shadow-library/ui';

import { StatusPage, StatusRegion } from '@/components/StatusPage';
import { AppShell } from '@/features/shell';
import { sessionQueryOptions } from '@/lib/apis';
import { MemoirDataProvider, type OnboardingStatus, useOnboardingStatus } from '@/lib/data';
import { confirmSessionAccount, currentPage, ONBOARDING_PATH, requireSession, routeByOnboarding, seedOnboardingStatus, signInUrl, useSessionGuard } from '@/lib/session';
import {
  createSyncedMemoirData,
  type DataReadiness,
  type SyncEngine,
  SyncEngineProvider,
  type SyncFailureReason,
  type SyncReadiness,
  useDataReadiness,
  useSyncEngine,
  useSyncStatus,
} from '@/lib/sync';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const session = await requireSession(context.queryClient, location.href);
    await routeByOnboarding(context.queryClient, session.sub, location.pathname);
  },
  component: AuthenticatedShell,
});

const SESSION_ENDED = 'Your session ended. One moment while the sign-in page opens.';

/** `useSessionGuard` flips to `redirecting` once the session is gone, so a signed-out owner never keeps seeing the app. */
function AuthenticatedShell(): ReactElement {
  const status = useSessionGuard();
  const queryClient = useQueryClient();
  const accountId = useQuery(sessionQueryOptions()).data?.sub;
  const data = useMemo(() => {
    if (!accountId) return null;
    const principal = (): Promise<string> => confirmSessionAccount(queryClient);
    const onAccountChanged = (): void => void principal().catch(() => undefined);
    const created = createSyncedMemoirData({ accountId, principal, onAccountChanged });
    seedOnboardingStatus(queryClient, created.queryClient, accountId);
    return created;
  }, [accountId, queryClient]);

  if (status === 'redirecting') return <StatusPage title="Redirecting to sign-in…" description={SESSION_ENDED} pending />;
  if (!data) return <GateSpinner label="Opening your account" />;

  return (
    <MemoirDataProvider key={accountId} value={data}>
      <SyncEngineProvider data={data}>
        <OnboardingGate>
          <AppShell>
            <StatusRegion>
              <Outlet />
            </StatusRegion>
          </AppShell>
        </OnboardingGate>
      </SyncEngineProvider>
    </MemoirDataProvider>
  );
}

type AccountStatus = { kind: 'pending' } | { kind: 'failed'; reason: SyncFailureReason } | { kind: 'known'; completed: boolean };

type GateState =
  { kind: 'closed' } | { kind: 'failed'; reason: Exclude<SyncFailureReason, 'deletion-pending'> } | { kind: 'redirect'; to: typeof ONBOARDING_PATH | '/' } | { kind: 'open' };

const PENDING: AccountStatus = { kind: 'pending' };

/** The synced account row carries the same `onboardingCompletedAt`, so an owner who already finished setup still opens the app when the account read fails offline. */
function resolveAccountStatus(onboarding: OnboardingStatus | undefined, readiness: DataReadiness, engine: SyncEngine | null, sync: SyncReadiness): AccountStatus {
  if (onboarding) return { kind: 'known', completed: onboarding.completed };
  if (readiness.kind !== 'failed') return PENDING;
  if (!engine) return readiness;
  if (sync.kind === 'loading') return PENDING;
  const completedAt = sync.kind === 'ready' ? engine.domains().account?.[0]?.['onboardingCompletedAt'] : undefined;
  return typeof completedAt === 'string' ? { kind: 'known', completed: true } : readiness;
}

/**
 * A deletion in progress refuses the account read (`ACC_002`) but still has to reach `/settings/delete`, so it opens the gate and
 * the deletion notices take over. While the owner stays on `/onboarding` after this gate saw the account un-onboarded, finishing
 * setup must not bounce the wizard away before it creates the first quest; leaving the page ends that.
 */
function resolveGate(account: AccountStatus, pathname: string, setupSeen: boolean): GateState {
  if (account.kind === 'pending') return { kind: 'closed' };
  if (account.kind === 'failed') return account.reason === 'deletion-pending' ? { kind: 'open' } : { kind: 'failed', reason: account.reason };
  const onOnboarding = pathname === ONBOARDING_PATH;
  if (!account.completed && !onOnboarding) return { kind: 'redirect', to: ONBOARDING_PATH };
  if (account.completed && onOnboarding && !setupSeen) return { kind: 'redirect', to: '/' };
  return { kind: 'open' };
}

/**
 * `onboarding_completed_at` null means the account has never chosen a currency or a wake window
 * (ARCHITECTURE §9.1), and every other screen would be reading defaults nobody agreed to — so nothing renders
 * until the account says which side of setup it is on, and each side is routed to where it belongs.
 */
export function OnboardingGate({ children }: { children: ReactElement }): ReactElement {
  const onboarding = useOnboardingStatus();
  const { readiness, retry, retrying } = useDataReadiness({ query: onboarding, source: 'server' });
  const engine = useSyncEngine();
  const { readiness: sync } = useSyncStatus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const account = resolveAccountStatus(onboarding.data, readiness, engine, sync);

  const [setupSeen, setSetupSeen] = useState(false);
  const seesSetup = pathname === ONBOARDING_PATH && (setupSeen || (account.kind === 'known' && !account.completed));
  if (seesSetup !== setupSeen) setSetupSeen(seesSetup);

  const gate = resolveGate(account, pathname, setupSeen);
  const redirectTo = gate.kind === 'redirect' ? gate.to : null;

  useEffect(() => {
    if (redirectTo) void navigate({ to: redirectTo, replace: true });
  }, [redirectTo, navigate]);

  if (gate.kind === 'open') return children;
  if (gate.kind === 'failed') return <AccountLoadFailed reason={gate.reason} retry={retry} retrying={retrying} />;
  return <GateSpinner label={gate.kind === 'redirect' && gate.to === ONBOARDING_PATH ? 'Opening setup' : 'Opening your account'} />;
}

function GateSpinner({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Spinner size="lg" aria-label={label} />
    </div>
  );
}

interface AccountLoadFailedProps {
  reason: Exclude<SyncFailureReason, 'deletion-pending'>;
  retry: () => void;
  retrying: boolean;
}

const ACCOUNT_FAILURE_COPY: Record<AccountLoadFailedProps['reason'], { title: string; description: string }> = {
  server: {
    title: "We couldn't load your account",
    description: "Shadow Memoir didn't respond, so it can't tell which screens are ready for you yet. Anything on this device is kept.",
  },
  offline: {
    title: "You're offline",
    description: 'Shadow Memoir needs a connection to open your account on this device for the first time. It will as soon as you reconnect.',
  },
  'signed-out': {
    title: 'Your session ended',
    description: 'Sign in again to open your account. Anything on this device is kept.',
  },
};

function AccountLoadFailed({ reason, retry, retrying }: AccountLoadFailedProps): ReactElement {
  const { title, description } = ACCOUNT_FAILURE_COPY[reason];
  const action =
    reason === 'signed-out' ? (
      <Button variant="primary" onClick={() => window.location.assign(signInUrl(currentPage()))}>
        Sign in again
      </Button>
    ) : (
      <Button variant="primary" loading={retrying} loadingText="Trying again…" onClick={retry}>
        Try again
      </Button>
    );

  return <StatusPage title={title} description={description} pending={retrying} actions={action} />;
}
