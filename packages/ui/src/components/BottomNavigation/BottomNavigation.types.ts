/**
 * Importing npm packages
 */
import { type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface BottomNavigationProps extends ComponentPropsWithoutRef<'nav'> {
  /** Controlled selected item value. */
  value?: string;
  /** Uncontrolled initial selection. */
  defaultValue?: string;
  /** Fires with the tapped item's value (selection itself is the consumer's routing concern when controlled). */
  onValueChange?: (value: string) => void;
  /** Pins the bar to the viewport bottom (safe-area aware). Disable to place it in your own layout. @default true */
  fixed?: boolean;
  /** `BottomNavigation.Item` elements — 3 to 5 top-level destinations. */
  children: ReactNode;
}

export interface BottomNavigationItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** Identity of this destination within the bar. */
  value: string;
  /** 24px destination glyph — decorative; the label names the item. */
  icon: ReactNode;
  /** Short always-visible label under the icon (never icon-only). */
  label: ReactNode;
  /** Optional count/dot overlay on the icon (e.g. a `Badge`). */
  badge?: ReactNode;
  /** Render the single child element as the item (Radix Slot) — e.g. wrap a router link. */
  asChild?: boolean;
}
