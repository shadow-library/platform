/**
 * Importing npm packages
 */
import { createContext, useContext } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface FormFieldContextValue {
  /** `id` assigned to the wrapped control (matches the label's `htmlFor`). */
  controlId: string;
  /** `id` of the helper/error slot, for the control's `aria-describedby`. */
  describedById: string | undefined;
  /** Whether the field is in an error state. */
  invalid: boolean;
  /** Whether the field is disabled. */
  disabled: boolean;
}

/**
 * Declaring the constants
 */
export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** Read the enclosing Form Field's wiring — for custom controls that opt into context. */
export function useFormField(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}
