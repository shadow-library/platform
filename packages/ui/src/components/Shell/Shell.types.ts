import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type ShellContentPadding = 'none' | 'sm' | 'md' | 'lg';

export interface ShellProps extends ComponentPropsWithoutRef<'div'> {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  /** Pin `topbar` to the viewport top below md too, where the document scrolls rather than the shell. Opt-in so no phone layout shifts unasked. */
  stickyTopbar?: boolean;
  /** Phone-only primary navigation (e.g. `BottomNavigation`), hidden from md up; the content region reserves room for it only when passed. */
  bottomNav?: ReactNode;
  theme?: 'light' | 'dark';
  density?: 'comfortable' | 'compact';
  /** Reading-column max-width for the content region; `'fluid'` fills it. @default 1200 */
  contentWidth?: number | 'fluid';
  /** Gutter scale around the content region; each step is responsive. `'none'` for full-bleed. @default 'md' */
  contentPadding?: ShellContentPadding;
  children?: ReactNode;
}

export interface PageProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  /**
   * Content max-width; `'fluid'` fills. Inside a `Shell` this narrows the page below the shell's
   * `contentWidth`; leave it unset to sit in the shell's column. Standalone it defaults to `1200`.
   */
  maxWidth?: number | 'fluid';
}

export interface ShellNav {
  hasSidebar: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}
