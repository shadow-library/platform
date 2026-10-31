import { type ComponentPropsWithoutRef } from 'react';

export interface BreadcrumbsProps extends ComponentPropsWithoutRef<'nav'> {
  /** Maximum crumbs before collapsing the middle into an overflow menu (keeps first + last two). @default 4 */
  maxVisible?: number;
  /**
   * Below this breakpoint (sm 640px, md 768px) only the last crumb renders, without its separator — for a narrow top bar. The ancestors leave the accessibility tree too, so
   * pair it with navigation that still reaches them (e.g. the shell's sidebar drawer).
   */
  hideAncestorsBelow?: 'sm' | 'md';
}

export interface BreadcrumbsItemProps extends ComponentPropsWithoutRef<'a'> {
  /** The current page — plain text with aria-current, not a link. @default false */
  current?: boolean;
  /** Render as the single child (e.g. a router link) via Slot. @default false */
  asChild?: boolean;
}
