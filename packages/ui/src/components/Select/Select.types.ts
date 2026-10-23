import type * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type SelectSize = 'sm' | 'md' | 'lg';

type RootProps = Pick<
  ComponentPropsWithoutRef<typeof SelectPrimitive.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'open' | 'defaultOpen' | 'onOpenChange' | 'disabled' | 'required' | 'name' | 'dir'
>;

export interface SelectProps extends RootProps {
  /** Text shown while nothing is selected. */
  placeholder?: string;
  /** Trigger height/typography scale — matches Input/Button. @default 'md' */
  size?: SelectSize;
  invalid?: boolean;
  /** Swap the chevron for a spinner while options load. */
  loading?: boolean;
  /** Class applied to the root — the positioning wrapper around the trigger (which fills it), not the trigger's visible surface itself. */
  className?: string;
  /** Class applied to the listbox content surface. */
  contentClassName?: string;
  /** `id` for the trigger, for external `<label for>` wiring. */
  triggerId?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  children?: ReactNode;
}

export interface SelectItemProps extends ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  /** Leading 16px icon mirrored into the trigger when selected. */
  icon?: ReactNode;
  description?: ReactNode;
}

export interface SelectGroupProps extends ComponentPropsWithoutRef<typeof SelectPrimitive.Group> {
  label?: ReactNode;
}

export type SelectSeparatorProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>;
