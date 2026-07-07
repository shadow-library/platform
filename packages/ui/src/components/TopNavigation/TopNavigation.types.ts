/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface TopNavigationProps extends Omit<ComponentPropsWithoutRef<'nav'>, 'title'> {
  /** Brand / product identity at the left. */
  brand?: ReactNode;
  /** Right-aligned utility cluster (search, notifications, account). */
  utility?: ReactNode;
  /** Collapse links past this count into a "More" menu (order preserved). Omit to show all. */
  maxVisible?: number;
  /** Landmark name. @default 'Main' */
  'aria-label'?: string;
}

export interface TopNavigationItemProps extends ComponentPropsWithoutRef<'a'> {
  /** The current destination — sets aria-current and the active underline. */
  active?: boolean;
  /** Render as the single child (router link) via Slot. */
  asChild?: boolean;
}
