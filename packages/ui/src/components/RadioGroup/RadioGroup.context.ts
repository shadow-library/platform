import { createContext, useContext } from 'react';

export interface RadioGroupContextValue {
  invalid: boolean;
}

export const RadioGroupContext = createContext<RadioGroupContextValue>({ invalid: false });

export function useRadioGroupContext(): RadioGroupContextValue {
  return useContext(RadioGroupContext);
}
