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

/** Prominence ladder — never encodes size or color (Foundations §12 API standards). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  /** Visual prominence. @default 'secondary' */
  variant?: ButtonVariant;
  /** Control height/typography scale. @default 'md' */
  size?: ButtonSize;
  /** Shows a spinner, preserves measured width, sets `aria-busy`, and blocks activation. */
  loading?: boolean;
  /** Stretches the button to fill its container (form/dialog action contexts). */
  fullWidth?: boolean;
  /** Adornment before the label — icon, spinner, kbd (Foundations adornment grammar). */
  prefix?: ReactNode;
  /** Adornment after the label. */
  suffix?: ReactNode;
  /** Render the single child element as the button (Radix Slot) — e.g. wrap a router link. */
  asChild?: boolean;
}
