import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './SegmentedControl.module.css';
import { type SegmentedControlItemProps, type SegmentedControlProps } from './SegmentedControl.types';

/** Radix RadioGroup, so announced as radios with one Tab stop and roving arrows. Exactly one segment is always selected; label the group via `aria-label`. */
const SegmentedControlRoot = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl({ size = 'md', fullWidth = false, className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root ref={ref} className={cn(styles.track, className)} data-size={size} data-full-width={fullWidth || undefined} orientation="horizontal" {...props} />
  );
});

const SegmentedControlItem = forwardRef<HTMLButtonElement, SegmentedControlItemProps>(function SegmentedControlItem({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Item ref={ref} className={cn(styles.item, className)} {...props} />;
});

export const SegmentedControl = Object.assign(SegmentedControlRoot, {
  Item: SegmentedControlItem,
});
