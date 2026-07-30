/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface TopNavigationProps extends Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
  /** Brand / product identity at the left. */
  brand?: ReactNode;
  /** Right-aligned utility cluster (search, notifications, account). */
  utility?: ReactNode;
  /** Collapse links past this count into a "More" menu (order preserved). Omit to show all. */
  maxVisible?: number;
  /** Name for the inner nav landmark — distinct from Sidebar's so the two don't collide. @default 'Top' */
  'aria-label'?: string;
}

export interface TopNavigationItemProps extends ComponentPropsWithoutRef<'a'> {
  /**
   * The current destination — sets aria-current and the active underline. Omit it under `asChild` when the
   * slotted router link already marks itself active: the same treatment keys off `data-status="active"`.
   */
  active?: boolean;
  /** Render as the single child (router link) via Slot. */
  asChild?: boolean;
}
