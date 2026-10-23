import { createContext, useContext } from 'react';

export interface RadioGroupContextValue {
  /** Propagates the group's invalid state to every item's circle. */
  invalid: boolean;
}

export const RadioGroupContext = createContext<RadioGroupContextValue>({ invalid: false });

export function useRadioGroupContext(): RadioGroupContextValue {
  return useContext(RadioGroupContext);
}
