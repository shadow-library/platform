/**
 * Importing npm packages
 */
import type * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /** Optional group heading (a `<legend>`-style label); omit when wrapped by Form Field. */
  label?: ReactNode;
  /** Presentation-only invalid state: danger border on every unselected circle. */
  invalid?: boolean;
}

export interface RadioItemProps extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  /** Visible label; the whole label is a click target. */
  label: ReactNode;
  /** Secondary line beneath the label, linked via `aria-describedby`. */
  description?: ReactNode;
}
