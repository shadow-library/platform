import type * as SwitchPrimitive from '@radix-ui/react-switch';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface SwitchProps extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'asChild'> {
  /** Feature name (never the state). Renders the settings-row: label left, switch right. */
  label?: ReactNode;
  description?: ReactNode;
  pending?: boolean;
}
