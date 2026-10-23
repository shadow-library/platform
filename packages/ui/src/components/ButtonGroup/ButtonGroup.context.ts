import { createContext, useContext } from 'react';

import { type ButtonSize, type ButtonVariant } from '../Button/Button.types';

export interface ButtonGroupContextValue {
  variant: ButtonVariant;
  size: ButtonSize;
}

/** Lives in its own module so Button can read it without pulling in the group's stylesheet. */
export const ButtonGroupContext = createContext<ButtonGroupContextValue | null>(null);

export function useButtonGroupContext(): ButtonGroupContextValue | null {
  return useContext(ButtonGroupContext);
}
