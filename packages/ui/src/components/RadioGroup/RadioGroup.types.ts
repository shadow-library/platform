import type * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type RadioGroupVariant = 'default' | 'card';

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  label?: ReactNode;
  invalid?: boolean;
  /** `card` draws each item as a bordered surface that is clickable as a whole; layout (stack or grid) stays with the caller's `className`. */
  variant?: RadioGroupVariant;
}

export interface RadioItemProps extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  label: ReactNode;
  description?: ReactNode;
}
