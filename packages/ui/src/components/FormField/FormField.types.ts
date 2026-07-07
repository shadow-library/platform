/**
 * Importing npm packages
 */
import { type HTMLAttributes, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface FormFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Field label, rendered above the control and linked via `htmlFor`. */
  label?: ReactNode;
  /** Helper text below the control; hidden while an error shows (same slot). */
  helper?: ReactNode;
  /** Error message; when truthy the field becomes invalid and this replaces the helper. */
  error?: ReactNode;
  /** Show a right-aligned “Required” marker on the label. */
  required?: boolean;
  /** Show a right-aligned “Optional” marker on the label. */
  optional?: boolean;
  /** Force the invalid state; defaults to `true` when `error` is truthy. */
  invalid?: boolean;
  /** Dim the whole field and disable the control. */
  disabled?: boolean;
  /** The single form control this field wraps. */
  children: ReactNode;
}
