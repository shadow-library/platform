/**
 * Importing npm packages
 */
import { type ReactNode, useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */
import { type ClientOnlyProps } from './ClientOnly.types';

/**
 * Declaring the constants
 */
const subscribe = (): (() => void) => () => undefined;
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * Renders its children only after the client has mounted. `useSyncExternalStore` reports `false` from its
 * server snapshot and `true` from its client snapshot, so the server and the first client render both
 * produce the fallback — no hydration mismatch — and the children appear once React takes over in the
 * browser. Reserved for widgets that genuinely can't render identically on the server (things that read
 * layout/DOM on mount, dev tools), so one non-SSR-safe subtree can't corrupt hydration for the whole page.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps): ReactNode {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return mounted ? children : fallback;
}
