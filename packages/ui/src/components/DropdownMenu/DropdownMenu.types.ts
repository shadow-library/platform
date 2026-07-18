/**
 * Importing npm packages
 */
import type * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>;

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  /** Leading 16px icon — use icons on all rows or none. */
  icon?: ReactNode;
  /** Right-aligned shortcut hint; visual only (`aria-hidden`), bindings live globally. */
  shortcut?: ReactNode;
  /** Danger styling for destructive actions; place last, below a separator. */
  destructive?: boolean;
}

export interface DropdownMenuCheckboxItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> {
  icon?: ReactNode;
  shortcut?: ReactNode;
}

export interface DropdownMenuRadioItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> {
  shortcut?: ReactNode;
}

export interface DropdownMenuSubTriggerProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}

export type DropdownMenuSubContentProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>;
export type DropdownMenuLabelProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>;
export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>;
