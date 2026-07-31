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

/** Which action rail is revealed — `leading` sits at the start edge, `trailing` at the end edge. */
export type SwipeActionsSide = 'leading' | 'trailing';

/** Rail action emphasis, mapped to the solid intent fills. */
export type SwipeActionIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface SwipeActionsProps extends ComponentPropsWithoutRef<'div'> {
  /** `SwipeActions.Action` elements revealed by swiping the row away from its start edge. */
  leading?: ReactNode;
  /** `SwipeActions.Action` elements revealed by swiping the row toward its start edge. */
  trailing?: ReactNode;
  /** Controlled open rail (`null` = closed). */
  open?: SwipeActionsSide | null;
  /** Uncontrolled initial rail. @default null */
  defaultOpen?: SwipeActionsSide | null;
  onOpenChange?: (open: SwipeActionsSide | null) => void;
  /** Swiping past 60% of the row width commits the rail's first action outright. @default false */
  fullSwipe?: boolean;
  /** The row surface. */
  children: ReactNode;
}

export interface SwipeActionsActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Solid fill emphasis. @default 'neutral' */
  intent?: SwipeActionIntent;
  /** Close the rail after the action runs. @default true */
  closeOnSelect?: boolean;
}
