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

/** No `text` variant — a bare icon with no hover surface has no affordance. */
export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** The icon (16px, or 20px at `lg`). Rendered decoratively — the accessible name is `aria-label`. */
  icon: ReactNode;
  /** Required accessible name. An icon button without one is a defect, not a variant. */
  'aria-label': string;
  /** Visual prominence. @default 'ghost' */
  variant?: IconButtonVariant;
  /** Square footprint scale. @default 'md' */
  size?: IconButtonSize;
  /** Shows a spinner in place of the icon, sets `aria-busy`, and blocks activation. */
  loading?: boolean;
  /** Toggle state — when defined, sets `aria-pressed` and applies the selected fill. */
  pressed?: boolean;
  /** Render the single child element as the button (Radix Slot); the icon is injected into it. */
  asChild?: boolean;
}
