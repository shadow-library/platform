/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { type Theme, type ThemeMode } from '@/types';

/**
 * Defining types
 */
export interface ThemeContextValue {
  /** The active theme — what `mode` currently resolves to. */
  theme: Theme;
  /** The persisted preference. `system` means nothing is stored, so the OS decides and keeps deciding. */
  mode: ThemeMode;
  /** Set the theme explicitly and persist the choice. */
  setTheme: (theme: Theme) => void;
  /** Set the preference, including back to `system`, which discards the stored choice. */
  setMode: (mode: ThemeMode) => void;
  /** Flip between light and dark. */
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
   * Domain to write the cookie for. Set it to the registrable parent domain (`.example.com`) so every app on a
   * subdomain of it shares one theme; leave it unset for a host-only cookie — the right choice on `localhost`,
   * where apps already share the host because a cookie's scope ignores the port.
   */
  cookieDomain?: string;
}
