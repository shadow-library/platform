import { type ReactElement, useEffect } from 'react';

import { useEquippedThemeAccentKey } from '@/lib/data';

/** Mounted inside the authenticated shell so it unmounts, clearing the attribute, on sign-out or account switch instead of surviving as a stale signal. */
export function EquippedThemeAccent(): ReactElement | null {
  const key = useEquippedThemeAccentKey();

  useEffect(() => {
    if (key) document.documentElement.setAttribute('data-accent', key);
    else document.documentElement.removeAttribute('data-accent');
    return () => document.documentElement.removeAttribute('data-accent');
  }, [key]);

  return null;
}
