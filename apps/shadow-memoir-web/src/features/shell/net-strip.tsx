import { useLocation } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Button } from '@shadow-library/ui';

import { notifyNotice } from '@/lib/data';
import { currentPage, signInUrl } from '@/lib/session';
import { type SyncSnapshot, useSyncEngine, useSyncStatus } from '@/lib/sync';

import { useSystemOverlays } from './system-overlays';
import styles from './net-strip.module.css';

const DELETION_MESSAGE = 'This account is being deleted, so nothing on this device syncs any more.';

interface StripCopy {
  message: string;
  action: 'retry' | 'sign-in' | null;
}

function stripCopy({ state, queuedCount, readiness }: SyncSnapshot): StripCopy {
  if (readiness.kind === 'failed' && readiness.reason === 'deletion-pending') return { message: DELETION_MESSAGE, action: null };
  if (state === 'offline') return { message: 'Offline. Everything you log is kept on this device and syncs when you reconnect.', action: null };
  if (state === 'signed-out') return { message: 'Your session ended. Your data and queue are kept on this device — sign in again to resume syncing.', action: 'sign-in' };
  if (state === 'syncing') return { message: queuedCount > 0 ? 'Syncing your queued changes…' : 'Syncing…', action: null };
  if (queuedCount > 0) return { message: "Some changes haven't synced yet.", action: 'retry' };
  if (readiness.kind === 'ready') return { message: "Couldn't reach Shadow Memoir. Everything on this device is kept.", action: 'retry' };
  return { message: "Couldn't reach Shadow Memoir, so your data hasn't loaded yet.", action: 'retry' };
}

/**
 * The one place the sync layer speaks to the owner about itself: a quiet strip while anything is not
 * "online", and one toast per notice — a command the server did not apply that no screen was waiting for
 * (a replay after a reload, or a screen that went away). A screen that ran the command presents its own outcome.
 */
export function NetStrip(): ReactElement | null {
  const status = useSyncStatus();
  const engine = useSyncEngine();
  const overlays = useSystemOverlays();
  const { pathname } = useLocation();
  const [retrying, setRetrying] = useState(false);
  const shown = useRef(new Set<string>());

  /** StrictMode runs this twice against the same snapshot before the dismissal lands, so a notice is remembered, not just dismissed. */
  useEffect(() => {
    for (const notice of status.notices) {
      if (!shown.current.has(notice.commandId)) notifyNotice(notice);
      shown.current.add(notice.commandId);
      engine?.dismissNotice(notice.commandId);
    }
  }, [status.notices, engine]);

  /** Onboarding is a forced flow the owner cannot leave, so a sheet over it takes the pointer with nothing behind it to go back to. */
  useEffect(() => {
    if (status.state === 'signed-out' && pathname !== '/onboarding') overlays.open('session-expired');
  }, [status.state, pathname, overlays]);

  if (!engine || status.state === 'online') return null;

  const copy = stripCopy(status);
  const retry = (): void => {
    if (retrying) return;
    setRetrying(true);
    void engine.sync().finally(() => setRetrying(false));
  };

  return (
    <div className={styles.strip} data-state={status.state} role="status" aria-busy={retrying || undefined}>
      <span>{copy.message}</span>
      <span className={styles.actions}>
        {status.queuedCount > 0 ? <span className={styles.count}>{status.queuedCount} queued</span> : null}
        {copy.action === 'sign-in' ? (
          <Button size="sm" variant="secondary" onClick={() => window.location.assign(signInUrl(currentPage()))}>
            Sign in again
          </Button>
        ) : null}
        {copy.action === 'retry' || retrying ? (
          <Button size="sm" variant="secondary" onClick={retry}>
            {retrying ? 'Trying again…' : 'Try again'}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
