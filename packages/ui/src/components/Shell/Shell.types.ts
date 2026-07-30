/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type ShellContentPadding = 'none' | 'sm' | 'md' | 'lg';

export interface ShellProps extends ComponentPropsWithoutRef<'div'> {
  /** The sidebar landmark (e.g. `Sidebar`), rendered first in the layout. */
  sidebar?: ReactNode;
  /** The top bar landmark (e.g. `TopNavigation`), pinned above the content. */
  topbar?: ReactNode;
  /** Mount the dark theme app-wide from the shell root. */
  theme?: 'light' | 'dark';
  /** Mount compact density app-wide from the shell root. */
  density?: 'comfortable' | 'compact';
  /** Reading-column max-width for the content region; `'fluid'` fills it. @default 1200 */
  contentWidth?: number | 'fluid';
  /** Gutter scale around the content region; each step is responsive. `'none'` for full-bleed. @default 'md' */
  contentPadding?: ShellContentPadding;
  /** Main content (usually `Page`s). */
  children?: ReactNode;
}

export interface PageProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Page title (heading-1). */
  title?: ReactNode;
  /** Supporting description under the title. */
  description?: ReactNode;
  /** Breadcrumb trail above the title. */
  breadcrumbs?: ReactNode;
  /** Header actions (one primary Button max). */
  actions?: ReactNode;
  /**
   * Content max-width; `'fluid'` fills. Inside a `Shell` this narrows the page below the shell's
   * `contentWidth`; leave it unset to sit in the shell's column. Standalone it defaults to `1200`.
   */
  maxWidth?: number | 'fluid';
}

export interface ShellNav {
  /** Whether an enclosing shell has a sidebar to project into the mobile nav drawer. */
  hasSidebar: boolean;
  /** Whether the mobile nav drawer is open — mirror it onto the trigger's `aria-expanded`. */
  open: boolean;
  /** Opens or closes the mobile nav drawer. */
  setOpen: (open: boolean) => void;
}
