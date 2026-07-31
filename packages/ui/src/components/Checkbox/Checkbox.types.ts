/**
 * Importing npm packages
 */
import type * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'asChild'> {
  /** Visible label; the whole label is a click target. Omit for a standalone box (supply `aria-label`). */
  label?: ReactNode;
  /** Secondary line beneath the label, linked via `aria-describedby`. */
  description?: ReactNode;
  /** Presentation-only invalid state: danger border on the unchecked box + `aria-invalid`. */
  invalid?: boolean;
}
