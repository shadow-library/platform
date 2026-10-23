import { type ButtonHTMLAttributes, type ReactNode } from 'react';

/** No `text` variant — a bare icon with no hover surface has no affordance. */
export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: ReactNode;
  /** Required accessible name. An icon button without one is a defect, not a variant. */
  'aria-label': string;
  /** Visual prominence. @default 'ghost' */
  variant?: IconButtonVariant;
  /** Square footprint scale. @default 'md' */
  size?: IconButtonSize;
  loading?: boolean;
  /** Toggle state — when defined, sets `aria-pressed` and applies the selected fill. */
  pressed?: boolean;
  asChild?: boolean;
}
