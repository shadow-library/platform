/**
 * Importing npm packages
 */
import type * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export interface TabsProps extends Omit<ComponentPropsWithoutRef<typeof TabsPrimitive.Root>, 'activationMode'> {
  /** `automatic` selects on arrow focus (default); `manual` moves focus and selects on Enter/Space. @default 'automatic' */
  activation?: 'automatic' | 'manual';
}

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

export interface TabsTabProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Optional leading 16px icon. */
  icon?: ReactNode;
  /** Optional trailing count badge (Logs 12). */
  count?: ReactNode;
}

export type TabsPanelProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;
