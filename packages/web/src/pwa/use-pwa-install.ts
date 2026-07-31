/**
 * Importing npm packages
 */
import { useCallback, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
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

/**
 * Declaring the constants
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Drive a custom "Install app" affordance. The browser fires `beforeinstallprompt` (which we stash instead of
 * letting the mini-infobar show), and `promptInstall()` replays it on a user gesture. `canInstall` reflects
 * whether a prompt is pending, and `isInstalled` flips once the app runs standalone. SSR-safe — all listeners
 * and DOM reads happen in the mount effect.
 */
export function usePwaInstall(): PwaInstall {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event): void => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      setIsInstalled(true);
      setPromptEvent(null);
    };

    setIsInstalled(isStandalone());
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
