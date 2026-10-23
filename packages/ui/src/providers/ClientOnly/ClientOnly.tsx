import { type ReactNode } from 'react';

import { useHydrated } from '@/hooks';

import { type ClientOnlyProps } from './ClientOnly.types';

/** Renders `fallback` on the server and during hydration, children once mounted. For widgets that can't render identically on the server. */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps): ReactNode {
  const hydrated = useHydrated();
  return hydrated ? children : fallback;
}
