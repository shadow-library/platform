import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'text' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonTone = 'neutral' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  /** Visual prominence. @default 'secondary' */
  variant?: ButtonVariant;
  /** Control height/typography scale. @default 'md' */
  size?: ButtonSize;
  /**
   * `danger` recolours `secondary`, `ghost` and `text` in the danger palette for a destructive action that should not shout (a row's Revoke). On `primary` it is the
   * `danger` variant. @default 'neutral'
   */
  tone?: ButtonTone;
  /** Shows a spinner, sets `aria-busy`, and blocks activation. */
  loading?: boolean;
  /** Label shown beside the spinner while `loading`; omitted, the spinner replaces the label and the width is preserved. */
  loadingText?: ReactNode;
  fullWidth?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  asChild?: boolean;
}
