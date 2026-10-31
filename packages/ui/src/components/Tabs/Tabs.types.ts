import type * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export interface TabsProps extends Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'activationMode'> {
  /** `automatic` selects on arrow focus (default); `manual` moves focus and selects on Enter/Space. @default 'automatic' */
  activation?: 'automatic' | 'manual';
}

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

export interface TabsTabProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Optional leading 16px icon. */
  icon?: ReactNode;
  /** Optional trailing count badge. */
  count?: ReactNode;
}

export interface TabsPanelProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {
  /**
   * Keep the panel mounted while another tab is selected, so its state (a half-edited form, a scroll position) survives the switch. It is `hidden` meanwhile: out of the
   * tab order and the accessibility tree. @default false
   */
  keepMounted?: boolean;
}
