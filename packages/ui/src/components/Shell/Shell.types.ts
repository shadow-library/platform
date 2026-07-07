/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface ShellProps extends ComponentPropsWithoutRef<'div'> {
  /** The sidebar landmark (e.g. `Sidebar`), rendered first in the layout. */
  sidebar?: ReactNode;
  /** The top bar landmark (e.g. `TopNavigation`), pinned above the content. */
  topbar?: ReactNode;
  /** Mount the dark theme app-wide from the shell root. */
  theme?: 'light' | 'dark';
  /** Mount compact density app-wide from the shell root. */
  density?: 'comfortable' | 'compact';
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
  /** Content max-width; `'fluid'` fills. @default 1200 */
  maxWidth?: number | 'fluid';
}
