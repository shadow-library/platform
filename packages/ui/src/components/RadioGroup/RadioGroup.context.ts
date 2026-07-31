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
export interface RadioGroupContextValue {
  /** Propagates the group's invalid state to every item's circle. */
  invalid: boolean;
}

/**
 * Declaring the constants
 */
export const RadioGroupContext = createContext<RadioGroupContextValue>({ invalid: false });

export function useRadioGroupContext(): RadioGroupContextValue {
  return useContext(RadioGroupContext);
}
