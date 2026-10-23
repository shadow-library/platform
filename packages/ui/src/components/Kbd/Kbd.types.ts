import { type ComponentPropsWithoutRef } from 'react';

export interface KbdProps extends ComponentPropsWithoutRef<'kbd'> {
  /** Binding like `mod+shift+K`; mod → ⌘ on macOS, Ctrl elsewhere. */
  keys?: string;
  /** No keycap box (menu rows, tooltips). */
  bare?: boolean;
  /** Force macOS glyphs; auto-detected otherwise. */
  mac?: boolean;
}
