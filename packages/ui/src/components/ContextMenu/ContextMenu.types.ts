/**
 * Importing npm packages
 */
import type * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Defining types
 */
export type ContextMenuContentProps = ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>;

export interface ContextMenuItemProps extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  /** Leading 16px icon — use icons on all rows or none. */
  icon?: ReactNode;
  /** Right-aligned shortcut hint; visual only (`aria-hidden`), bindings live globally. */
  shortcut?: ReactNode;
  /** Danger styling for destructive actions; place last, below a separator. */
  destructive?: boolean;
}

export interface ContextMenuCheckboxItemProps extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem> {
  icon?: ReactNode;
  shortcut?: ReactNode;
}

export interface ContextMenuRadioItemProps extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem> {
  shortcut?: ReactNode;
}

export interface ContextMenuSubTriggerProps extends ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}

export type ContextMenuSubContentProps = ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>;
export type ContextMenuLabelProps = ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>;
export type ContextMenuSeparatorProps = ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>;
