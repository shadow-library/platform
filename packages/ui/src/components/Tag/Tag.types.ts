/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export type TagSize = 'sm' | 'md' | 'lg';

export interface TagProps extends ComponentPropsWithoutRef<'span'> {
  /** 24 default · 20 dense · 28 in large fields. @default 'md' */
  size?: TagSize;
  /** User-assigned color rendered as a leading 8px swatch; the tag fill stays neutral. */
  color?: string;
  /** Renders a trailing remove (×) button; the callback fires on click/Enter/Space. */
  onRemove?: () => void;
  /** Render the tag as its single child (e.g. an `<a>`) so a clickable tag is a real link. @default false */
  asChild?: boolean;
}
