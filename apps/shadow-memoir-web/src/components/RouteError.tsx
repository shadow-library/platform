import { useQueryClient } from '@tanstack/react-query';
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { AccessDenied, Button, toast } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';
import { isAccessDeniedError } from '@shadow-library/web/router';

import { logout } from '@/lib/apis';
import { currentPage, signInUrl } from '@/lib/session';

import { MemoirMark } from './icons';
import { StatusPage, useStatusPageVariant } from './StatusPage';

const SIGN_OUT_FAILED = 'Couldn’t sign out — check your connection and try again.';
const ACCOUNT_DENIED = "You're signed in, but this account doesn't have access. Sign out to switch to another account — nothing you've logged on this device is affected.";

/**
 * The router's last resort for anything a route throws. A 403 gets its own face because retrying will not get
 * the owner past it — only another account will.
 */
export default function RouteError({ error }: ErrorComponentProps): ReactElement {
  if (isAccessDeniedError(error)) return <AccountDenied />;
  return <LoadFailed />;
}

/**
 * The boundary resets itself once the router finishes loading again (TanStack keys it on `loadedAt`), so retrying
 * is clearing the failed queries — a cached session error would otherwise be served straight back — and re-running
 * the route's `beforeLoad`.
 */
function LoadFailed(): ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  const retry = async (): Promise<void> => {
    if (retrying) return;
    setRetrying(true);
    try {
      await queryClient.resetQueries({ predicate: query => query.state.status === 'error' && query.state.data === undefined });
      await router.invalidate();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <StatusPage
      title="Shadow Memoir couldn't open this page"
      description="It may be a connection problem or a hiccup on our side. Everything you've logged on this device is kept."
      pending={retrying}
      actions={
        <>
          <Button variant="primary" loading={retrying} loadingText="Trying again…" onClick={() => void retry()}>
            Try again
          </Button>
          <Button variant="secondary" disabled={retrying} onClick={() => window.location.reload()}>
            Reload
          </Button>
        </>
      }
    />
  );
}

function AccountDenied(): ReactElement {
  const [signingOut, setSigningOut] = useState(false);
  const Root = useStatusPageVariant() === 'page' ? 'main' : 'section';

  const signOut = async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { redirectTo } = await logout();
      window.location.assign(redirectTo ?? signInUrl(currentPage()));
    } catch (error) {
      if (isApiError(error) && error.status === 401) return window.location.assign(signInUrl(currentPage()));
      setSigningOut(false);
      toast.warning(SIGN_OUT_FAILED);
    }
  };

  return (
    <Root className="flex items-center justify-center" style={{ minHeight: Root === 'main' ? '100dvh' : undefined }}>
      <AccessDenied
        illustration={<MemoirMark size={40} />}
        title="This account can't use Shadow Memoir"
        description={ACCOUNT_DENIED}
        action={{ label: 'Sign out and switch account', onClick: () => void signOut(), loading: signingOut }}
      />
    </Root>
  );
}
