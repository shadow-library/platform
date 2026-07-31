/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends ComponentPropsWithoutRef<'span'> {
  /** 14 (inside controls) / 20 (standalone, default) / 24 (region-level). @default 'md' */
  size?: SpinnerSize;
  /** Screen-reader status text. @default 'Loading' */
  label?: string;
}
