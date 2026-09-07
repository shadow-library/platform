import { useCallback, useSyncExternalStore } from 'react';
import { type InstallOutcome, usePwaInstall } from '@shadow-library/web/pwa';

const VALUE_DELIVERED_KEY = 'shadow-memoir:value-delivered';
const OFFER_SETTLED_KEY = 'shadow-memoir:install-offer-settled';

export interface InstallOffer {
  /** The browser can install, the owner has already got something out of the app, and the offer is unspent. */
  shouldOffer: boolean;
  /** Shows the native prompt and records the offer as spent whatever the answer. */
  offer: () => Promise<InstallOutcome>;
  /** Records the offer as spent without showing it — the "Not now" path. */
  dismiss: () => void;
}

const listeners = new Set<() => void>();

/** `getSnapshot` runs on every render, and the value behind it is two `localStorage` reads. */
let cached: boolean | null = null;

function notify(): void {
  cached = null;
  for (const listener of listeners) listener();
}

/**
 * Marks that the app has delivered something worth keeping — the first completed quest, the first saved log.
 * Installation is offered only after this, never as a gate on arrival (PRODUCT.md §6.6), so the moment is
 * recorded by the screen that produced the value rather than inferred by a timer.
 */
export function markValueDelivered(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(VALUE_DELIVERED_KEY, '1');
  notify();
}

function read(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === '1';
}

function subscribeToOffer(onStoreChange: () => void): () => void {
  cached = null;
  listeners.add(onStoreChange);
  return () => void listeners.delete(onStoreChange);
}

function getEligible(): boolean {
  cached ??= read(VALUE_DELIVERED_KEY) && !read(OFFER_SETTLED_KEY);
  return cached;
}

function getServerEligible(): boolean {
  return false;
}

/**
 * The install offer, gated on that first value and spent exactly once. A person who said no is never asked
 * again — repeating the ask is the nagging the product's notification rules forbid on every other channel,
 * and there is no reason this one should be the exception.
 */
export function useInstallOffer(): InstallOffer {
  const { canInstall, promptInstall } = usePwaInstall();
  // localStorage is an external store whose server snapshot is `false`, so the server render and the
  // hydration render agree and the persisted answer lands after mount.
  const eligible = useSyncExternalStore(subscribeToOffer, getEligible, getServerEligible);

  const settle = useCallback(() => {
    window.localStorage.setItem(OFFER_SETTLED_KEY, '1');
    notify();
  }, []);

  const offer = useCallback(async (): Promise<InstallOutcome> => {
    const outcome = await promptInstall();
    settle();
    return outcome;
  }, [promptInstall, settle]);

  return { shouldOffer: canInstall && eligible, offer, dismiss: settle };
}
