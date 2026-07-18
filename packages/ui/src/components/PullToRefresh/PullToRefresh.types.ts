/**
 * Importing npm packages
 */
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Gesture lifecycle: resting → finger-down travel → past-threshold → awaiting `onRefresh`. */
export type PullToRefreshStatus = 'idle' | 'pulling' | 'armed' | 'refreshing';

export interface PullToRefreshProps extends ComponentPropsWithoutRef<'div'> {
  /** Runs when a pull is released past the threshold; a returned promise keeps the spinner until it settles. */
  onRefresh: () => void | Promise<void>;
  /** Pull distance (px, after resistance) that arms a refresh. @default 64 */
  threshold?: number;
  /** Disables the gesture and the keyboard affordance. */
  disabled?: boolean;
  /** Label of the visually-hidden-until-focused keyboard affordance. @default 'Refresh' */
  refreshLabel?: ReactNode;
  /** The scrollable content. */
  children: ReactNode;
}
