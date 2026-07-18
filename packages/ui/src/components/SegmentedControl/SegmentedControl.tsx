/**
 * Importing npm packages
 */
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './SegmentedControl.module.css';
import { type SegmentedControlItemProps, type SegmentedControlProps } from './SegmentedControl.types';

/**
 * A compact single-choice control for reconfiguring a view (chart period, layout, units) — applied
 * instantly, never more than four options. Wraps Radix RadioGroup, so it is announced as the radio
 * choice it is (role radiogroup/radio, aria-checked) with one Tab stop and roving arrows. Exactly one
 * segment is always selected; the selected segment is the thumb (its own fill + e1), never a floating
 * layer. Label the group via `aria-label`.
 */
const SegmentedControlRoot = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl({ size = 'md', fullWidth = false, className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root ref={ref} className={cn(styles.track, className)} data-size={size} data-full-width={fullWidth || undefined} orientation="horizontal" {...props} />
  );
});

/** A single segment. `value` is required; children are one short word or an aria-labelled icon. */
const SegmentedControlItem = forwardRef<HTMLButtonElement, SegmentedControlItemProps>(function SegmentedControlItem({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Item ref={ref} className={cn(styles.item, className)} {...props} />;
});

export const SegmentedControl = Object.assign(SegmentedControlRoot, {
  Item: SegmentedControlItem,
});
