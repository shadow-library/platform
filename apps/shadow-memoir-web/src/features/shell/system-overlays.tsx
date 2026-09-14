import { useNavigate } from '@tanstack/react-router';
import { createContext, type ReactElement, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Button, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { OverlaySurface } from '@/components/OverlaySurface';
import { type OfflineReadiness, useAppUpdate } from '@/lib/app-update';
import { useAppSync, useNotificationSettings } from '@/lib/data';
import { type InstallOffer, useInstallOffer } from '@/lib/install-offer';
import { currentPage, signInUrl } from '@/lib/session';

import styles from './system-overlays.module.css';

export type SystemOverlayKind = 'install' | 'install-preview' | 'update' | 'session-expired' | 'notifications';

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
  'Keeps working when the connection drops — quests, capture and logs queue on the device.',
];

const INSTALL_OFFER_PREFIX = 'Installing adds it to your home screen and lets it open without a browser.';

const INSTALL_OFFER_OFFLINE: Record<OfflineReadiness, string> = {
  unavailable: 'Either way, anything you log is kept on this device and syncs when you reconnect.',
  'next-load': 'Either way, it opens offline after its next load here, and anything you log syncs when you reconnect.',
  ready: 'Everything works either way — the app already opens offline and syncs when you reconnect.',
};

/**
 * The shell-level overlays: everything the app needs to say about itself rather than about the day. They are
 * driven by a context rather than by each screen, so App and sync can raise the same update sheet the
 * service worker raises on its own.
 */
export function SystemOverlayProvider({ children }: { children: ReactNode }): ReactElement {
  const [kind, setKind] = useState<SystemOverlayKind | null>(null);
  const install = useInstallOffer();
  const controls = useMemo<SystemOverlayControls>(() => ({ open: setKind, close: () => setKind(null) }), []);

  const [offered, setOffered] = useState(false);
  if (offered !== install.shouldOffer) {
    setOffered(install.shouldOffer);
    if (install.shouldOffer) setKind(current => current ?? 'install');
  }

  return (
    <SystemOverlayContext.Provider value={controls}>
      {children}
      <SystemOverlays kind={kind} install={install} onClose={controls.close} />
    </SystemOverlayContext.Provider>
  );
}

function SystemOverlays({ kind, install, onClose }: { kind: SystemOverlayKind | null; install: InstallOffer; onClose: () => void }): ReactElement {
  const navigate = useNavigate();
  const update = useAppUpdate();
  const appSync = useAppSync();
  const queue = appSync.data?.queue ?? [];
  const updateWaiting = update.update !== 'none';

  const change = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const declineInstall = (): void => {
    install.dismiss();
    onClose();
  };

  const go = (to: string): void => {
    onClose();
    void navigate({ to });
  };

  return (
    <>
      <OverlaySurface
        open={kind === 'install'}
        onOpenChange={open => !open && declineInstall()}
        title="Keep Shadow Memoir a tap away"
        description={`${INSTALL_OFFER_PREFIX} ${INSTALL_OFFER_OFFLINE[update.offline]}`}
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
            <Button variant="ghost" onClick={declineInstall}>
              Not now
            </Button>
          </>
        }
      >
        <InstallFacts />
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'install-preview'}
        onOpenChange={change}
        title="What installing looks like"
        description="On your other device, open Shadow Memoir in its browser and choose install. This is what it offers there — nothing is installed from here."
        footer={
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        }
      >
        <InstallFacts />
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'update'}
        onOpenChange={change}
        title={updateWaiting ? 'A new version is ready' : 'You’re up to date'}
        footer={
          updateWaiting ? (
            <>
              <Button variant="primary" loading={update.update === 'applying'} loadingText="Reloading…" onClick={update.apply}>
                Reload now
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Later
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          )
        }
      >
        <p className={styles.lead}>
          {updateWaiting
            ? 'It applies the next time you open the app, or you can reload now. Anything queued on this device is kept through the update.'
            : 'This device already runs the newest version of Shadow Memoir.'}
        </p>
      </OverlaySurface>

      <OverlaySurface
        open={kind === 'session-expired'}
        onOpenChange={change}
        title="Your session ended"
        size="md"
        footer={
          <>
            <Button variant="primary" onClick={() => window.location.assign(signInUrl(currentPage()))}>
              Sign in again
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Keep working on this device
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          <Alert intent="info" title="Nothing was lost">
            Everything you logged is stored on this device. Sign in again and it syncs straight away — nothing needs re-entering, and you can keep logging in the meantime.
          </Alert>
          <section className={styles.section} aria-labelledby="session-queue-label">
            <h3 id="session-queue-label" className={styles.sectionLabel}>
              Waiting to sync
            </h3>
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
          </section>
        </div>
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
        <div className={styles.body}>
          <p className={styles.lead}>Nothing has arrived here yet. Shadow Memoir sends what you choose by email rather than to an in-app inbox.</p>
          <NotificationCategories />
        </div>
      </OverlaySurface>
    </>
  );
}

function InstallFacts(): ReactElement {
  return (
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
  );
}

function NotificationCategories(): ReactElement {
  const settings = useNotificationSettings();

  return (
    <section className={styles.section} aria-labelledby="notification-categories-label">
      <h3 id="notification-categories-label" className={styles.sectionLabel}>
        By email
      </h3>
      <DataState query={settings} source="server" size="inline" skeleton={<Skeleton.List rows={3} />}>
        {data => (
          <ul className={styles.categories}>
            {data.preferences.map(preference => (
              <li key={preference.id} className={styles.category}>
                <span>{preference.label}</span>
                <span className={styles.categoryState} data-on={preference.email}>
                  {preference.email ? 'On' : 'Off'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataState>
    </section>
  );
}
