/**
 * Importing npm packages
 */
import { type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Prominence — `primary` is the accent-filled default; `secondary` reads surface-card + border. */
export type FabVariant = 'primary' | 'secondary';

export type FabSize = 'md' | 'lg';

/** Where the FAB floats (safe-area aware). `static` renders in place for consumer-managed layouts. */
export type FabPlacement = 'bottom-end' | 'bottom-center' | 'bottom-start' | 'static';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  /** The action glyph. Marked decorative (`aria-hidden`) when a `label` names the action. */
  icon: ReactNode;
  /** Extended-FAB label — when present the FAB widens into a pill with icon + text. */
  label?: ReactNode;
  /** Visual prominence. @default 'primary' */
  variant?: FabVariant;
  /** Footprint scale. @default 'md' */
  size?: FabSize;
  /** Floating corner, offset past the device safe areas. @default 'bottom-end' */
  placement?: FabPlacement;
  /** Render the single child element as the FAB (Radix Slot) — e.g. wrap a router link. */
  asChild?: boolean;
}
