import { createContext, type ReactElement, useContext, useEffect, useState } from 'react';

import { type Theme, type ThemeMode } from '@/types';

import { type ThemeContextValue, type ThemeInitScriptOptions, type ThemeProviderProps } from './ThemeProvider.types';

const DEFAULT_COOKIE_NAME = 'shadow-theme';

const COOKIE_MAX_AGE = 31536000;

/** Cookie names are RFC 6265 tokens; this is the safe subset, and it is also regex- and script-injection-safe. */
const COOKIE_NAME_PATTERN = /^[\w.-]+$/;

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', mode: 'system', setTheme: () => undefined, setMode: () => undefined, toggleTheme: () => undefined });

function assertSafeKey(key: string): string {
  if (!COOKIE_NAME_PATTERN.test(key)) throw new Error(`Invalid theme storage key '${key}' — only letters, digits, '_', '.' and '-' are allowed`);
  return key;
}

/** Blocking `<head>` snippet applying the persisted or OS theme to `<html>` before first paint. Pass the same options as `ThemeProvider`. */
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

function setCookie(name: string, mode: ThemeMode, domain: string | undefined): void {
  const value = mode === 'system' ? '' : mode;
  const attributes = [`${name}=${value}`, 'path=/', `max-age=${mode === 'system' ? 0 : COOKIE_MAX_AGE}`, 'samesite=lax'];
  if (domain) attributes.push(`domain=${domain}`);
  if (window.location.protocol === 'https:') attributes.push('secure');
  document.cookie = attributes.join('; ');
}

/**
 * Parent domain shared by sibling apps (`identity.shadow-apps.test` → `.shadow-apps.test`). Derived because a build-time variable bakes in one
 * environment's domain and silently stops the preference crossing apps when omitted. Undefined for an IP literal, `localhost` or a bare registrable domain.
 */
function sharedDomain(hostname: string): string | undefined {
  if (hostname.includes(':') || /^\d+(\.\d+)*$/.test(hostname)) return undefined;
  const labels = hostname.split('.');
  if (labels.length < 3) return undefined;
  return `.${labels.slice(1).join('.')}`;
}

/**
 * A host-only cookie from an earlier build shares the name but not the scope, and `document.cookie` can't tell them apart, so it is cleared first
 * or it would shadow the shared one. A domain the browser refuses (public suffix) is dropped silently, so the write is read back and retried host-only.
 */
function writeCookie(name: string, mode: ThemeMode, domain: string | undefined): void {
  const scope = domain ?? sharedDomain(window.location.hostname);
  if (scope == null) return setCookie(name, mode, undefined);

  setCookie(name, 'system', undefined);
  setCookie(name, mode, scope);
  if (mode !== 'system' && readCookie(name) == null) setCookie(name, mode, undefined);
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

/** `promote` marks a choice from this app's legacy storage, not yet visible to the other apps. */
function resolveClientMode(cookieName: string, legacyStorageKey: string | undefined): { mode: ThemeMode; promote: boolean } {
  const shared = readCookie(cookieName);
  if (shared) return { mode: shared, promote: false };

  const legacy = readLegacyStorage(legacyStorageKey);
  if (legacy) return { mode: legacy, promote: true };

  return { mode: 'system', promote: false };
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Styling flips on `data-theme` and the `dark` class at the document root. Server and first client render use `defaultTheme`; a mount effect then adopts
 * the persisted or OS theme, and re-applying also recovers when a hydration fallback re-creates `<html>`.
 * The choice is a cookie, not `localStorage`, because the apps are separate origins (subdomains, or ports in development) and cookie scope crosses both;
 * the theme is re-read when the page becomes visible again since another app may have changed it.
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
      /* `system` is never published: it is the absence of a choice and must keep tracking the OS. */
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
