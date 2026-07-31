/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type ProgressIntent = 'accent' | 'success' | 'danger';
export type ProgressSize = 'sm' | 'md';

export interface ProgressProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** Current value. Ignored when `indeterminate`. @default 0 */
  value?: number;
  /** Maximum value. @default 100 */
  max?: number;
  /** Unknown-duration bar — an animated sweep, no percent label. @default false */
  indeterminate?: boolean;
  /** Optional label row (name left, % right). */
  label?: ReactNode;
  /** Fill color — recolor on completion via intent tokens. @default 'accent' */
  intent?: ProgressIntent;
  /** Track height: sm 4px (default) · md 6px for page-level banners. @default 'sm' */
  size?: ProgressSize;
}
