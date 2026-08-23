import { type ReactElement, useEffect } from 'react';
import { toast } from '@shadow-library/ui';

import { type NetState, useSyncEngine, useSyncStatus } from '@/lib/sync';

import { useSystemOverlays } from './system-overlays';
import styles from './net-strip.module.css';

const MESSAGES: Record<Exclude<NetState, 'online'>, string> = {
  offline: 'Offline. Everything you log is kept on this device and syncs when you reconnect.',
  syncing: 'Syncing your queued changes.',
  failed: 'Some changes are still waiting. They will be retried.',
  'signed-out': 'Signed out. Your data and queue are intact — sign in to resume syncing.',
};

/**
 * The one place the sync layer speaks to the owner about itself: a quiet strip while anything is not
 * "online", and a single calm notice per rejected command. Rejections are toasts rather than a blocking
 * dialog because the local effect already stands — the next delta pull is what corrects it.
 */
export function NetStrip(): ReactElement | null {
  const status = useSyncStatus();
  const engine = useSyncEngine();
  const overlays = useSystemOverlays();

  useEffect(() => {
    for (const notice of status.notices) {
      toast.neutral(notice.message);
      engine?.dismissNotice(notice.commandId);
    }
  }, [status.notices, engine]);

  useEffect(() => {
    if (status.state === 'signed-out') overlays.open('session-expired');
  }, [status.state, overlays]);

  if (!engine || status.state === 'online') return null;

  return (
    <div className={styles.strip} data-state={status.state} role="status">
      <span>{MESSAGES[status.state]}</span>
      {status.queuedCount > 0 ? <span className={styles.count}>{status.queuedCount} queued</span> : null}
    </div>
  );
}
