/**
 * Importing npm packages
 */
import { useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/**
 * Track the browser's online/offline state. Backed by `useSyncExternalStore`, so it is tearing-free and
 * SSR-safe — the server snapshot is `true` (assume online) and the client corrects on hydration, so there is
 * no mismatch. Use it to gate optimistic writes, show an offline banner, or read from downloaded content.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
