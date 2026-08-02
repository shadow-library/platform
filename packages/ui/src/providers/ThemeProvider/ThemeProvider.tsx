/**
 * Importing npm packages
 */
import { createContext, type ReactElement, useContext, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type Theme, type ThemeMode } from '@/types';

import { type ThemeContextValue, type ThemeInitScriptOptions, type ThemeProviderProps } from './ThemeProvider.types';

/**
 * Declaring the constants
 */
const DEFAULT_COOKIE_NAME = 'shadow-theme';

/** A year — long enough that the choice outlives any realistic gap between visits to two of the apps. */
const COOKIE_MAX_AGE = 31536000;

/** Cookie names are RFC 6265 tokens; this is the safe subset, and it is also regex- and script-injection-safe. */
const COOKIE_NAME_PATTERN = /^[\w.-]+$/;

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', mode: 'system', setTheme: () => undefined, setMode: () => undefined, toggleTheme: () => undefined });

function assertSafeKey(key: string): string {
  if (!COOKIE_NAME_PATTERN.test(key)) throw new Error(`Invalid theme storage key '${key}' — only letters, digits, '_', '.' and '-' are allowed`);
  return key;
}

/**
 * The blocking snippet to inline in the document `<head>` (before the app script) so the persisted (or
 * OS-preferred) theme is on `<html>` before first paint — no flash of the wrong palette, and React never
 * renders a `data-theme`/`dark` that could mismatch the server HTML. Kept dependency-free and stringified.
 * Pass the same options you give `ThemeProvider`.
 */
export function themeInitScript({ cookieName = DEFAULT_COOKIE_NAME, legacyStorageKey }: ThemeInitScriptOptions = {}): string {
  const legacy = legacyStorageKey ? `if(t!=='light'&&t!=='dark'){t=localStorage.getItem('${assertSafeKey(legacyStorageKey)}');}` : '';
  return (
    `(function(){try{` +
    `var m=document.cookie.match('(?:^|; )${assertSafeKey(cookieName)}=([^;]*)');` +
    `var t=m?decodeURIComponent(m[1]):null;` +
    legacy +
    `if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}` +
    `var r=document.documentElement;r.setAttribute('data-theme',t);r.classList.toggle('dark',t==='dark');` +
    `}catch(e){}})();`
  );
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
}

function readCookie(name: string): Theme | null {
  const match = document.cookie.match(`(?:^|; )${name}=([^;]*)`);
  if (!match?.[1]) return null;
  const value = decodeURIComponent(match[1]);
  return value === 'light' || value === 'dark' ? value : null;
}

/** Persist an explicit choice, or erase it (`system`) by expiring the cookie in the same scope it was written. */
function writeCookie(name: string, mode: ThemeMode, domain: string | undefined): void {
  const value = mode === 'system' ? '' : mode;
  const attributes = [`${name}=${value}`, 'path=/', `max-age=${mode === 'system' ? 0 : COOKIE_MAX_AGE}`, 'samesite=lax'];
  if (domain) attributes.push(`domain=${domain}`);
  if (window.location.protocol === 'https:') attributes.push('secure');
  document.cookie = attributes.join('; ');
}

function systemTheme(fallback: Theme): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readLegacyStorage(key: string | undefined): Theme | null {
  if (!key) return null;
  try {
    const stored = localStorage.getItem(key);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    /* storage unavailable (private mode) — treat it as nothing persisted */
    return null;
  }
}

/**
 * The persisted preference — the same resolution `themeInitScript` performs before paint. `promote` marks a
 * choice that came from this app's own legacy storage and so is not yet visible to the other apps.
 */
function resolveClientMode(cookieName: string, legacyStorageKey: string | undefined): { mode: ThemeMode; promote: boolean } {
  const shared = readCookie(cookieName);
  if (shared) return { mode: shared, promote: false };

  const legacy = readLegacyStorage(legacyStorageKey);
  if (legacy) return { mode: legacy, promote: true };

  return { mode: 'system', promote: false };
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
 *
 * The choice lives in a **cookie**, not `localStorage`, so that every Shadow app shares it: `localStorage` is
 * partitioned per origin and the apps are separate origins — distinct subdomains in production, distinct
 * ports in development. A cookie scoped to the parent domain crosses subdomains, and cookie scope ignores
 * the port, so one switch in one app is the theme every other app opens with. Since that can happen while a
 * tab sits in the background, the theme is re-read whenever the page becomes visible again.
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const { children, defaultTheme = 'light', cookieName = DEFAULT_COOKIE_NAME, cookieDomain, legacyStorageKey } = props;
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mode, setModeState] = useState<ThemeMode>('system');

  const commit = (next: ThemeMode): void => {
    const resolved = next === 'system' ? systemTheme(defaultTheme) : next;
    applyTheme(resolved);
    setThemeState(resolved);
    setModeState(next);
  };

  useEffect(() => {
    const adopt = (): void => {
      const { mode: resolved, promote } = resolveClientMode(cookieName, legacyStorageKey);
      /*
       * A choice carried over from this app's own pre-cookie storage is invisible to the others, so publish it —
       * otherwise the apps stay split until the user happens to toggle. `system` is deliberately never published:
       * it is the absence of a choice, and must keep tracking the OS rather than freeze at whatever it resolved
       * to on one visit. Only the first app opened after the upgrade promotes; the cookie governs from then on.
       */
      if (promote) writeCookie(cookieName, resolved, cookieDomain);
      commit(resolved);
    };

    adopt();

    const onVisible = (): void => void (document.visibilityState === 'visible' && adopt());
    document.addEventListener('visibilitychange', onVisible);
    /* `pageshow` covers a back-navigation restored from the bfcache, where no effect would otherwise re-run. */
    window.addEventListener('pageshow', adopt);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', adopt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `commit` is re-created every render; its inputs are listed.
  }, [cookieName, cookieDomain, legacyStorageKey, defaultTheme]);

  /** While no explicit choice is stored, the OS stays live — flipping it at the OS repaints the app immediately. */
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => commit('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `commit` is re-created every render; its inputs are listed.
  }, [mode, defaultTheme]);

  const setMode = (next: ThemeMode): void => {
    writeCookie(cookieName, next, cookieDomain);
    commit(next);
  };

  const setTheme = (next: Theme): void => setMode(next);

  const toggleTheme = (): void => setMode(theme === 'dark' ? 'light' : 'dark');

  return <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, toggleTheme }}>{children}</ThemeContext.Provider>;
}
