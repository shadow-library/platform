/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface SliderProps {
  /** Single value, or `[lo, hi]` for a range. */
  value?: number | number[];
  /** Uncontrolled initial value. */
  defaultValue?: number | number[];
  /** Fires continuously while dragging. */
  onValueChange?: (value: number | number[]) => void;
  /** Fires once on release — for expensive consumers. */
  onValueCommit?: (value: number | number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Unit appended to the value display (e.g. `%`). */
  unit?: string;
  /** Custom value formatter (overrides `unit`). */
  formatValue?: (value: number) => string;
  /** Label shown in the mandatory value row. */
  label?: ReactNode;
  /** Show the value display (mandatory by design; disable only when a paired stepper shows it). @default true */
  showValue?: boolean;
  /** Render step-mark dots (≤ 10 stops). @default false */
  marks?: boolean;
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}
