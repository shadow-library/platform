/**
 * Importing npm packages
 */
import { createContext } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ShellMobileNavContextValue {
  /** Whether the shell has a sidebar to project into the mobile nav drawer. */
  hasSidebar: boolean;
  /** Drawer open state — mirrored onto the hamburger's `aria-expanded`. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

export interface ShellMobileNavAreaContextValue {
  /** Closes the mobile nav drawer — Sidebar items call it after navigating. */
  close: () => void;
}

/**
 * Declaring the constants
 */

/** Provided by Shell; lets TopNavigation surface the hamburger that opens the mobile nav drawer. */
export const ShellMobileNavContext = createContext<ShellMobileNavContextValue | null>(null);

/** Wraps the sidebar copy projected into the drawer; Sidebar reads it to adapt (always expanded, no rail toggle, close-on-navigate). */
export const ShellMobileNavAreaContext = createContext<ShellMobileNavAreaContextValue | null>(null);
