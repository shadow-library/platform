import { useNavigate } from '@tanstack/react-router';
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Button } from '@shadow-library/ui';
import { useServiceWorker } from '@shadow-library/web/pwa';

import { OverlaySurface } from '@/components/OverlaySurface';
import { useAppSync } from '@/lib/data';
import { type InstallOffer, useInstallOffer } from '@/lib/install-offer';

import styles from './system-overlays.module.css';

export type SystemOverlayKind = 'install' | 'update' | 'session-expired' | 'notifications';

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
  const appSync = useAppSync();
  const queue = appSync.data?.queue ?? [];

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
        {queue.length === 0 ? (
          <p className={styles.lead}>Nothing is waiting. Everything you have logged on this device already reached the server.</p>
        ) : (
          <ul className={styles.queue}>
            {queue.map(entry => (
              <li key={entry.id} className={styles.queueRow}>
                <span>{entry.text}</span>
                <span className={styles.queueWhen}>{entry.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'notifications'}
        onOpenChange={change}
        title="Notifications"
        size="md"
        footer={
          <Button variant="ghost" onClick={() => go('/settings/notifications')}>
            Notification preferences
          </Button>
        }
      >
        <p className={styles.lead}>
          Nothing has arrived here yet. Shadow Memoir sends reminders, the weekly review and coaching results by email and push rather than to an in-app inbox — which categories
          reach you is yours to choose, and every one starts off.
        </p>
      </OverlaySurface>
    </>
  );
}
