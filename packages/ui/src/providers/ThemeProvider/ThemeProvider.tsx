/**
 * Importing npm packages
 */
import { createContext, type ReactElement, useContext, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type Theme } from '@/types';

import { type ThemeContextValue, type ThemeProviderProps } from './ThemeProvider.types';

/**
 * Declaring the constants
 */
const DEFAULT_STORAGE_KEY = 'shadow-theme';

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', setTheme: () => undefined, toggleTheme: () => undefined });

/**
 * The blocking snippet to inline in the document `<head>` (before the app script) so the persisted (or
 * OS-preferred) theme is on `<html>` before first paint — no flash of the wrong palette, and React never
 * renders a `data-theme`/`dark` that could mismatch the server HTML. Kept dependency-free and stringified.
 * Pass the same `storageKey` you give `ThemeProvider`.
 */
export function themeInitScript(storageKey: string = DEFAULT_STORAGE_KEY): string {
  return `(function(){try{var k='${storageKey}';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.setAttribute('data-theme',t);r.classList.toggle('dark',t==='dark');}catch(e){}})();`;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
}

/** The persisted (or OS-preferred) theme — the same resolution `themeInitScript` performs before paint. */
function resolveClientTheme(storageKey: string, fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable (private mode) — fall through to the OS preference */
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return fallback;
}

/** Read the active theme and the setters. Returns the light default outside a `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Owns the theme choice for a Shadow UI app. Styling flips purely on `data-theme` (and the `dark` class)
 * at the document root, so this provider mounts no visual chrome — it reconciles React state and the DOM.
 * The server and the first client render both use the deterministic `defaultTheme`, so hydration matches;
 * a mount effect then adopts the persisted/OS theme (never during render). `themeInitScript` should apply
 * the same theme pre-hydration so there is no flash. Re-applying in the effect is idempotent and self-heals
 * the case where a hydration fallback re-creates `<html>` and wipes what the script set.
 */
export function ThemeProvider({ children, defaultTheme = 'light', storageKey = DEFAULT_STORAGE_KEY }: ThemeProviderProps): ReactElement {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  useEffect(() => {
    const resolved = resolveClientTheme(storageKey, defaultTheme);
    applyTheme(resolved);
    setThemeState(resolved);
  }, [storageKey, defaultTheme]);

  const setTheme = (next: Theme): void => {
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* the choice still applies for this session even when storage rejects the write */
    }
    applyTheme(next);
    setThemeState(next);
  };

  const toggleTheme = (): void => setTheme(theme === 'dark' ? 'light' : 'dark');

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
