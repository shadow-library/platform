/**
 * Importing npm packages
 */
import type * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ComponentPropsWithoutRef } from 'react';

/**
 * Defining types
 */
export type SegmentedControlSize = 'sm' | 'md';

export interface SegmentedControlProps extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>, 'orientation'> {
  /** Track height — md 32 (aligns with control-height-md) · sm 28. @default 'md' */
  size?: SegmentedControlSize;
  /** Stretch segments to fill the width equally. @default false */
  fullWidth?: boolean;
}

export type SegmentedControlItemProps = ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>;
