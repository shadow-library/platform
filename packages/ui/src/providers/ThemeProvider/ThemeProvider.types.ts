/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { type Theme } from '@/types';

/**
 * Defining types
 */
export interface ThemeContextValue {
  /** The active theme. */
  theme: Theme;
  /** Set the theme explicitly and persist the choice. */
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark. */
  toggleTheme: () => void;
}

export interface ThemeProviderProps {
  children?: ReactNode;
  /** Fallback theme when nothing is stored and the OS preference can't be read. @default 'light' */
  defaultTheme?: Theme;
  /** localStorage key the choice is persisted under — must match the key passed to `themeInitScript`. @default 'shadow-theme' */
  storageKey?: string;
}
