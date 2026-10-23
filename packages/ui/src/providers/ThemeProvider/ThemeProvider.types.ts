import { type ReactNode } from 'react';

import { type Theme, type ThemeMode } from '@/types';

export interface ThemeContextValue {
  theme: Theme;
  /** The persisted preference. `system` means nothing is stored, so the OS decides and keeps deciding. */
  mode: ThemeMode;
  setTheme: (theme: Theme) => void;
  /** Set the preference, including back to `system`, which discards the stored choice. */
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export interface ThemeInitScriptOptions {
  /** Cookie the choice is read from — must match the `cookieName` given to `ThemeProvider`. @default 'shadow-theme' */
  cookieName?: string;
  /** A pre-cookie `localStorage` key to fall back to, so visitors who chose a theme before the cookie existed keep it. */
  legacyStorageKey?: string;
}

export interface ThemeProviderProps extends ThemeInitScriptOptions {
  children?: ReactNode;
  /** Fallback theme when nothing is persisted and the OS preference can't be read. @default 'light' */
  defaultTheme?: Theme;
  /**
   * Domain to write the cookie for. Leave unset to derive the registrable parent (`identity.example.com` → `.example.com`), falling back to
   * host-only where there is none (`localhost`, an IP, a bare registrable domain) or the browser refuses it. Override for apps not on sibling subdomains.
   */
  cookieDomain?: string;
}
