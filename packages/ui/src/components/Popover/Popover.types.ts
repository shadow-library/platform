/**
 * Importing npm packages
 */
import type * as PopoverPrimitive from '@radix-ui/react-popover';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type PopoverProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>;

export interface PopoverContentProps extends ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Preferred side; flips/shifts to stay in view. @default 'bottom' */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment along the side. @default 'center' */
  align?: 'start' | 'center' | 'end';
  /** Distance from the trigger in px. @default 8 */
  sideOffset?: number;
}

export interface PopoverHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /** Title (body-sm 600) — also labels the dialog via aria-labelledby. */
  title?: ReactNode;
  /** Supporting description (caption). */
  description?: ReactNode;
}
