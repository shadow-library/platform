import type * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  label?: ReactNode;
  invalid?: boolean;
}

export interface RadioItemProps extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}
