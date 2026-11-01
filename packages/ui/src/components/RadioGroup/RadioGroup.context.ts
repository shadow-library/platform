import { createContext, useContext } from 'react';

import { type RadioGroupVariant } from './RadioGroup.types';

export interface RadioGroupContextValue {
  invalid: boolean;
  variant: RadioGroupVariant;
}

export const RadioGroupContext = createContext<RadioGroupContextValue>({ invalid: false, variant: 'default' });

export function useRadioGroupContext(): RadioGroupContextValue {
  return useContext(RadioGroupContext);
}
