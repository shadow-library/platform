import { createContext } from 'react';

export interface ShellMobileNavContextValue {
  hasSidebar: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export interface ShellMobileNavAreaContextValue {
  close: () => void;
}

export const ShellMobileNavContext = createContext<ShellMobileNavContextValue | null>(null);

/** Wraps the sidebar copy projected into the drawer; Sidebar reads it to adapt (always expanded, no rail toggle, close-on-navigate). */
export const ShellMobileNavAreaContext = createContext<ShellMobileNavAreaContextValue | null>(null);

/** True inside a shell's content region — `Page` reads it to drop its own gutters and column, which the shell has already applied. */
export const ShellContentContext = createContext(false);
