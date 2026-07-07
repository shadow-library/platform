/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export type NumberStepperSize = 'sm' | 'md' | 'lg';

export interface NumberStepperProps {
  /** Controlled value (`null` when the field is empty). */
  value?: number | null;
  /** Uncontrolled initial value. */
  defaultValue?: number | null;
  /** Fires with the next value. */
  onValueChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Increment per step / arrow. @default 1 */
  step?: number;
  /** Decimal places (rounds stepped values). */
  precision?: number;
  /** Unit suffix (sugar for a trailing addon). */
  unit?: string;
  /** `split` places − / + on the field edges; `chevrons` stacks up/down in the padding. @default 'split' */
  buttons?: 'split' | 'chevrons';
  /** Field height — matches Input. @default 'md' */
  size?: NumberStepperSize;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** Accessible verb for the step buttons ("Increase" / "Decrease" + this). */
  itemLabel?: ReactNode;
  id?: string;
  className?: string;
  'aria-label'?: string;
}
