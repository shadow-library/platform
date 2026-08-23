import { useNavigate } from '@tanstack/react-router';
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Button, toast } from '@shadow-library/ui';
import { useServiceWorker } from '@shadow-library/web/pwa';

import { OverlaySurface } from '@/components/OverlaySurface';
import { type InstallOffer, useInstallOffer } from '@/lib/install-offer';

import styles from './system-overlays.module.css';

export type SystemOverlayKind = 'install' | 'update' | 'sync-conflict' | 'session-expired' | 'notifications';

export interface SystemOverlayControls {
  open: (kind: SystemOverlayKind) => void;
  close: () => void;
}

const SystemOverlayContext = createContext<SystemOverlayControls>({ open: () => undefined, close: () => undefined });

export function useSystemOverlays(): SystemOverlayControls {
  return useContext(SystemOverlayContext);
}

const INSTALL_FACTS = [
  'Opens full screen from your home screen, with your wake window intact.',
  'Works with no connection — quests, capture and logs all queue on the device.',
  'Makes push available, and every category stays off until you turn it on.',
];

const CONFLICT_OPTIONS = [
  { id: 'device', source: 'This device, offline', value: '78.4 kg', when: 'Logged 07:05, still queued' },
  { id: 'server', source: 'Synced from the web', value: '78.9 kg', when: 'Logged 06:58 from another browser' },
];

const WAITING = [
  { id: 'w1', text: 'Morning run completed', when: '07:40' },
  { id: 'w2', text: 'Expense €18.40 · Groceries', when: '09:12' },
  { id: 'w3', text: 'Journal entry · 84 words', when: '21:02' },
];

interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  when: string;
  to: string;
  unread: boolean;
}

const NOTIFICATIONS: NotificationEntry[] = [
  { id: 'n1', title: 'Your coaching result is ready', body: 'Three patterns in last week’s adherence, and one suggestion for Thursdays.', when: '06:02', to: '/ai', unread: true },
  { id: 'n2', title: 'The weekly review is waiting', body: 'Week 34 · 11 to 17 August. It takes about four minutes.', when: 'Fri', to: '/review', unread: true },
  { id: 'n3', title: 'A streak closed', body: 'The evening stretch closed at nine days. A recovery quest is available today.', when: 'Fri', to: '/hero/recovery', unread: false },
  { id: 'n4', title: 'A subscription renews tomorrow', body: '€10.99, counted in the August subscription total.', when: 'Thu', to: '/finance/subscriptions', unread: false },
];

/**
 * The shell-level overlays: everything the app needs to say about itself rather than about the day. They are
 * driven by a context rather than by each screen, so App and sync can raise the same install and update
 * sheets the service worker raises on its own.
 */
export function SystemOverlayProvider({ children }: { children: ReactNode }): ReactElement {
  const [kind, setKind] = useState<SystemOverlayKind | null>(null);
  const install = useInstallOffer();
  const controls = useMemo<SystemOverlayControls>(() => ({ open: setKind, close: () => setKind(null) }), []);

  useEffect(() => {
    if (install.shouldOffer) setKind('install');
  }, [install.shouldOffer]);

  return (
    <SystemOverlayContext.Provider value={controls}>
      {children}
      <SystemOverlays kind={kind} install={install} onClose={controls.close} />
    </SystemOverlayContext.Provider>
  );
}

function SystemOverlays({ kind, install, onClose }: { kind: SystemOverlayKind | null; install: InstallOffer; onClose: () => void }): ReactElement {
  const navigate = useNavigate();
  const { applyUpdate } = useServiceWorker({ url: '/sw.js' });
  const [unread, setUnread] = useState(NOTIFICATIONS.filter(entry => entry.unread).map(entry => entry.id));

  const change = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const go = (to: string): void => {
    onClose();
    void navigate({ to });
  };

  return (
    <>
      <OverlaySurface
        open={kind === 'install'}
        onOpenChange={change}
        title="Keep Shadow Memoir a tap away"
        description="Installing adds it to your home screen and lets it open without a browser. Everything works either way — the app already runs offline and syncs when you reconnect."
        footer={
          <>
            <Button
              variant="primary"
              onClick={() => {
                void install.offer();
                onClose();
              }}
            >
              Install
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                install.dismiss();
                onClose();
              }}
            >
              Do not ask again
            </Button>
          </>
        }
      >
        <ul className={styles.facts}>
          {INSTALL_FACTS.map(fact => (
            <li key={fact} className={styles.fact}>
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
              <span>{fact}</span>
            </li>
          ))}
        </ul>
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'update'}
        onOpenChange={change}
        title="A new version is ready"
        footer={
          <>
            <Button variant="primary" onClick={applyUpdate}>
              Reload now
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
          </>
        }
      >
        <p className={styles.lead}>It applies the next time you open the app, or you can reload now. Anything queued on this device is kept through the update.</p>
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'sync-conflict'}
        onOpenChange={change}
        title="Two versions of today’s weight"
        description="You logged a weight on this device while offline, and another on the web. Only one can be today's value — the other stays in History as a corrected entry."
        footer={
          <Button variant="ghost" onClick={onClose}>
            Decide later, and keep both in History
          </Button>
        }
      >
        <div className={styles.options}>
          {CONFLICT_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={styles.option}
              onClick={() => {
                toast.neutral(`Kept ${option.value}. The other is in History as a corrected entry.`);
                onClose();
              }}
            >
              <span className={styles.optionSource}>{option.source}</span>
              <span className={styles.optionValue}>{option.value}</span>
              <span className={styles.optionWhen}>{option.when}</span>
            </button>
          ))}
        </div>
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'session-expired'}
        onOpenChange={change}
        title="Your session ended while you were offline"
        footer={
          <>
            <Button variant="primary" onClick={onClose}>
              Keep working offline
            </Button>
            <Button variant="ghost" onClick={() => go('/settings/app')}>
              See the sync queue
            </Button>
          </>
        }
      >
        <Alert intent="info" title="Nothing was lost">
          Everything you logged is stored on this device and syncs as soon as the platform restores the session. You can keep logging in the meantime, and nothing needs
          re-entering.
        </Alert>
        <p className={styles.sectionLabel}>Waiting to sync</p>
        <ul className={styles.queue}>
          {WAITING.map(entry => (
            <li key={entry.id} className={styles.queueRow}>
              <span>{entry.text}</span>
              <span className={styles.queueWhen}>{entry.when}</span>
            </li>
          ))}
        </ul>
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'notifications'}
        onOpenChange={change}
        title="Notifications"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUnread([])}>
              Mark all read
            </Button>
            <Button variant="ghost" onClick={() => go('/settings/notifications')}>
              Notification preferences
            </Button>
          </>
        }
      >
        <ul className={styles.notifications}>
          {NOTIFICATIONS.map(entry => (
            <li key={entry.id}>
              <button type="button" className={styles.notification} data-unread={unread.includes(entry.id)} onClick={() => go(entry.to)}>
                <span className={styles.dot} aria-hidden />
                <span>
                  <span className={styles.notificationTitle}>{entry.title}</span>
                  <span className={styles.notificationBody}>{entry.body}</span>
                </span>
                <span className={styles.notificationWhen}>{entry.when}</span>
              </button>
            </li>
          ))}
        </ul>
      </OverlaySurface>
    </>
  );
}
