/**
 * Importing npm packages
 */
import { useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const subscribe = (): (() => void) => () => undefined;
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * Reports whether React has taken over in the browser. `useSyncExternalStore` returns the server snapshot
 * (`false`) on the server and during the hydration render, then flips to the client snapshot (`true`) once
 * hydration completes; in a purely client-side render it is `true` from the first render. Gate output that
 * cannot exist in server HTML (portals, layout reads) behind it, so the hydration render always matches
 * the server and one DOM-dependent subtree can't force React to regenerate the whole page.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
