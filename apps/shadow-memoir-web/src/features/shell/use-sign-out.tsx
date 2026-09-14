import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, toast } from '@shadow-library/ui';
import { isApiError } from '@shadow-library/web';

import { logout } from '@/lib/apis';
import { formatCount } from '@/lib/format';
import { currentPage, signInUrl } from '@/lib/session';
import { useSyncEngine, useSyncStatus } from '@/lib/sync';

const CONNECTION_NEEDED = 'Sign out needs a connection — nothing was removed.';
const SIGN_OUT_FAILED = 'Couldn’t sign out — try again';

export interface SignOutOptions {
  /** Receives focus when a cancelled confirmation's opener is gone, such as a menu item that closed with its menu. */
  fallbackFocusSelector?: string;
}

export interface SignOut {
  requestSignOut: () => void;
  signingOut: boolean;
  confirmDialog: ReactElement;
}

function isFocusable(target: HTMLElement | null | undefined): target is HTMLElement {
  return target != null && target.isConnected;
}

export function useSignOut({ fallbackFocusSelector }: SignOutOptions = {}): SignOut {
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const signingOutRef = useRef(false);
  const { queuedCount } = useSyncStatus();
  const engine = useSyncEngine();

  // `ConfirmDialog` exposes no `onCloseAutoFocus`, so this restores focus itself on cancel.
  const confirmOpenerRef = useRef<HTMLElement | null>(null);
  const confirmWasOpenRef = useRef(false);
  useEffect(() => {
    const justClosed = confirmWasOpenRef.current && !confirmOpen;
    confirmWasOpenRef.current = confirmOpen;
    if (!justClosed) return undefined;
    const target = confirmOpenerRef.current;
    const fallback = fallbackFocusSelector ? document.querySelector<HTMLElement>(fallbackFocusSelector) : null;
    const restoreTarget = isFocusable(target) ? target : fallback;
    const timer = setTimeout(() => {
      if (isFocusable(restoreTarget)) restoreTarget.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [confirmOpen, fallbackFocusSelector]);

  // A full-page `window.location.assign` at the end, never an in-SPA `navigate` to `/login` — that would
  // leave `useSessionGuard` mounted long enough to race its own redirect in with the wrong `returnTo`.
  const performSignOut = async (): Promise<void> => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    toast.neutral('Signing out…');
    const returnTo = currentPage();

    let redirectTo: string | undefined;
    let sessionGone: boolean;
    try {
      redirectTo = (await logout()).redirectTo;
      sessionGone = true;
    } catch (error) {
      const status = isApiError(error) ? error.status : undefined;
      if (status === 401) {
        sessionGone = true;
      } else {
        signingOutRef.current = false;
        setSigningOut(false);
        toast[status === -1 || status === undefined ? 'warning' : 'danger'](status === -1 || status === undefined ? CONNECTION_NEEDED : SIGN_OUT_FAILED);
        return;
      }
    }

    if (sessionGone) {
      try {
        await engine?.store.wipeAccount();
      } catch {
        /* the redirect below still ends the session either way */
      }
    }
    engine?.store.close();
    window.location.assign(redirectTo ?? signInUrl(returnTo));
  };

  const requestSignOut = (): void => {
    if (signingOutRef.current) return;
    if (!navigator.onLine) {
      toast.warning(CONNECTION_NEEDED);
      return;
    }
    if (queuedCount > 0) {
      confirmOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConfirmOpen(true);
      return;
    }
    void performSignOut();
  };

  const confirmDialog = (
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      intent="danger"
      title={`Sign out and discard ${formatCount(queuedCount, 'unsynced change', 'unsynced changes')}?`}
      confirmLabel="Sign out"
      cancelLabel="Keep working"
      loading={signingOut}
      onConfirm={() => void performSignOut()}
    />
  );

  return { requestSignOut, signingOut, confirmDialog };
}
