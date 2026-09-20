import { type ReactElement, useEffect } from 'react';

import { useEquippedThemeAccentKey } from '@/lib/data';

/**
 * Mounted once inside the authenticated shell, under `MemoirDataProvider`, so it unmounts (and clears the
 * attribute) on sign-out or account switch rather than surviving as a stale signal from a different account.
 */
export function EquippedThemeAccent(): ReactElement | null {
  const key = useEquippedThemeAccentKey();

  useEffect(() => {
    if (key) document.documentElement.setAttribute('data-accent', key);
    else document.documentElement.removeAttribute('data-accent');
    return () => document.documentElement.removeAttribute('data-accent');
  }, [key]);

  return null;
}
