/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export interface BreadcrumbsProps extends ComponentPropsWithoutRef<'nav'> {
  /** Maximum crumbs before collapsing the middle into an overflow menu (keeps first + last two). @default 4 */
  maxVisible?: number;
}

export interface BreadcrumbsItemProps extends ComponentPropsWithoutRef<'a'> {
  /** The current page — plain text with aria-current, not a link. @default false */
  current?: boolean;
  /** Render as the single child (e.g. a router link) via Slot. @default false */
  asChild?: boolean;
}
