/**
 * Importing npm packages
 */
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Tracks a CSS media query, re-rendering when it flips. SSR- and pre-hydration-safe: the server
 * snapshot is `false`, so gated UI renders the default branch until hydration completes — pair it
 * with a CSS media query when the pre-hydration frame must already look right.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      const mediaQueryList = globalThis.matchMedia(query);
      mediaQueryList.addEventListener('change', onStoreChange);
      return () => mediaQueryList.removeEventListener('change', onStoreChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia(query).matches,
    () => false,
  );
}
