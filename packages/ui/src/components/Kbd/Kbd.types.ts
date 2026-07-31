/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export interface KbdProps extends ComponentPropsWithoutRef<'kbd'> {
  /** Binding string like `mod+shift+K` — parsed to platform glyphs (mod → ⌘ on macOS, Ctrl elsewhere). */
  keys?: string;
  /** Bare glyphs on the host surface, no keycap box (menu rows, tooltips). @default false */
  bare?: boolean;
  /** Force macOS glyphs; defaults to auto-detection. */
  mac?: boolean;
}
