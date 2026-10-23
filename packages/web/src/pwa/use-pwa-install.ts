import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface PwaInstall {
  /** The browser has offered installation and the app isn't already installed — show a custom install button. */
  canInstall: boolean;
  /** Running as an installed PWA (standalone display mode). */
  isInstalled: boolean;
  /** Show the native install prompt; resolves with the user's choice, or `'unavailable'` when no prompt is pending. */
  promptInstall: () => Promise<InstallOutcome>;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

/** `appinstalled` fires in the tab that triggered the install, which itself keeps running in the browser display mode. */
let appInstalled = false;

function getIsInstalled(): boolean {
  return appInstalled || window.matchMedia(STANDALONE_QUERY).matches || (navigator as { standalone?: boolean }).standalone === true;
}

function getServerIsInstalled(): boolean {
  return false;
}

function subscribeToIsInstalled(onStoreChange: () => void): () => void {
  const media = window.matchMedia(STANDALONE_QUERY);
  const onInstalled = (): void => {
    appInstalled = true;
    onStoreChange();
  };
  media.addEventListener('change', onStoreChange);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    media.removeEventListener('change', onStoreChange);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Stashes `beforeinstallprompt` instead of letting the mini-infobar show, and replays it from `promptInstall()` on a user gesture. */
export function usePwaInstall(): PwaInstall {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const isInstalled = useSyncExternalStore(subscribeToIsInstalled, getIsInstalled, getServerIsInstalled);

  useEffect(() => {
    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => setPromptEvent(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!promptEvent) return 'unavailable';
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    return choice.outcome;
  }, [promptEvent]);

  return { canInstall: promptEvent !== null && !isInstalled, isInstalled, promptInstall };
}
