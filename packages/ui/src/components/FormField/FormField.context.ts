import { createContext, useContext } from 'react';

export interface FormFieldContextValue {
  controlId: string;
  describedById: string | undefined;
  invalid: boolean;
  disabled: boolean;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

export function useFormField(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}
