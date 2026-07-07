/**
 * Importing npm packages
 */
import type * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
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
  /** Presentation-only invalid state: danger border/ring + `aria-invalid` on the trigger. */
  invalid?: boolean;
  /** Swap the chevron for a spinner while options load. */
  loading?: boolean;
  /** Class applied to the trigger (the visible field). */
  className?: string;
  /** Class applied to the listbox content surface. */
  contentClassName?: string;
  /** `id` for the trigger, for external `<label for>` wiring. */
  triggerId?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** `Select.Item` / `Select.Group` / `Select.Separator` children. */
  children?: ReactNode;
}

export interface SelectItemProps extends ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  /** Leading 16px icon (status dot, flag, avatar) mirrored into the trigger when selected. */
  icon?: ReactNode;
  /** Secondary line beneath the label for consequential choices (plan tiers, etc.). */
  description?: ReactNode;
}

export interface SelectGroupProps extends ComponentPropsWithoutRef<typeof SelectPrimitive.Group> {
  /** Section heading rendered above the group's items. */
  label?: ReactNode;
}

export type SelectSeparatorProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>;
