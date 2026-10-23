import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type FabVariant = 'primary' | 'secondary';

export type FabSize = 'md' | 'lg';

/** Where the FAB floats. `static` renders in place; `fixed` sets `position: fixed` with no offsets so a consumer class can position it. */
export type FabPlacement = 'bottom-end' | 'bottom-center' | 'bottom-start' | 'static' | 'fixed';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  /** The action glyph. Marked decorative (`aria-hidden`) when a `label` names the action. */
  icon: ReactNode;
  label?: ReactNode;
  /** Visual prominence. @default 'primary' */
  variant?: FabVariant;
  /** Footprint scale. @default 'md' */
  size?: FabSize;
  /** Floating corner, offset past the device safe areas. @default 'bottom-end' */
  placement?: FabPlacement;
  asChild?: boolean;
}
