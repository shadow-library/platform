import { useLocation } from '@tanstack/react-router';
import { type ReactElement, useEffect, useState } from 'react';
import { Button, toast } from '@shadow-library/ui';

import { type SyncSnapshot, useSyncEngine, useSyncStatus } from '@/lib/sync';

import { useSystemOverlays } from './system-overlays';
import styles from './net-strip.module.css';

const DELETION_MESSAGE = 'This account is being deleted, so nothing on this device syncs any more.';

interface StripCopy {
  message: string;
  retry: boolean;
}

function stripCopy({ state, queuedCount, readiness }: SyncSnapshot): StripCopy {
  if (readiness.kind === 'failed' && readiness.reason === 'deletion-pending') return { message: DELETION_MESSAGE, retry: false };
  if (state === 'offline') return { message: 'Offline. Everything you log is kept on this device and syncs when you reconnect.', retry: false };
  if (state === 'signed-out') return { message: 'Signed out. Your data and queue are intact — sign in to resume syncing.', retry: false };
  if (state === 'syncing') return { message: queuedCount > 0 ? 'Syncing your queued changes…' : 'Syncing…', retry: false };
  if (queuedCount > 0) return { message: "Some changes haven't synced yet.", retry: true };
  if (readiness.kind === 'ready') return { message: "Couldn't reach Shadow Memoir. Everything on this device is kept.", retry: true };
  return { message: "Couldn't reach Shadow Memoir, so your data hasn't loaded yet.", retry: true };
}

/**
 * The one place the sync layer speaks to the owner about itself: a quiet strip while anything is not
 * "online", and a single calm notice per rejected command. Rejections are toasts rather than a blocking
 * dialog because the local effect already stands — the next delta pull is what corrects it.
 */
export function NetStrip(): ReactElement | null {
  const status = useSyncStatus();
  const engine = useSyncEngine();
  const overlays = useSystemOverlays();
  const { pathname } = useLocation();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    for (const notice of status.notices) {
      toast.neutral(notice.message);
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
        {copy.retry || retrying ? (
          <Button size="sm" variant="secondary" onClick={retry}>
            {retrying ? 'Trying again…' : 'Try again'}
          </Button>
        ) : null}
      </span>
    </div>
  );
}
