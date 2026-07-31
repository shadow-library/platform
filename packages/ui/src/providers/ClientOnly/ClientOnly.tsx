/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { useHydrated } from '@/hooks';

import { type ClientOnlyProps } from './ClientOnly.types';

/**
 * Declaring the constants
 */

/**
 * Renders its children only after the client has mounted. `useHydrated` is `false` on the server and
 * during the hydration render, so both produce the fallback — no hydration mismatch — and the children
 * appear once React takes over in the browser. Reserved for widgets that genuinely can't render
 * identically on the server (things that read layout/DOM on mount, dev tools), so one non-SSR-safe
 * subtree can't corrupt hydration for the whole page.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps): ReactNode {
  const hydrated = useHydrated();
  return hydrated ? children : fallback;
}
